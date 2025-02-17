import * as ort from "onnxruntime-web/webgpu";
import { tokenToChord } from "@/data/token_to_chord";
import { transpositionMap } from "@/data/transposition_map";
import { useStore } from "@/state/use_store";

// Add a special token for the start and end of the sequence
const numTokens = Object.keys(tokenToChord).length + 2;

// Cache the predictions to avoid running the model too many times
let predictionCache = new Map<string, { token: number; prob: number }[]>();
const maxCacheSize = 32;

// Initialize the worker (predictions are made there to avoid blocking the main thread while using WebGPU)
// Check https://onnxruntime.ai/docs/tutorials/web/env-flags-and-session-options.html#envwasmproxy for more info
const worker = new Worker(new URL("../models/onnx_worker.ts", import.meta.url));
let prevModelPath = "";

// Process the chords into a tensor that can be fed into the model
function process_chords(
  chords: {
    index: number;
    token: number;
    duration: number;
    variant: number;
  }[],
) {
  const data: BigInt64Array = new BigInt64Array(256).fill(BigInt(0));

  data[0] = BigInt(numTokens - 2); // Start token
  let i = 1;
  for (let j = 0; j < chords.length; j++) {
    if (chords[j].token === -1 || BigInt(chords[j].token) === data[i - 1])
      continue;
    if (i >= 255) {
      throw new Error("sequence is too long");
    }
    data[i] = BigInt(chords[j].token);
    i++;
  }
  // End token is not included

  return [i, data];
}

// After inference, the output is a 3D tensor, but we only need the column corresponding to the last chord
function getColumnSlice(tensor: any, columnIndex: number): Float32Array {
  const [D1, D2, D3] = tensor.dims;

  if (columnIndex < 0 || columnIndex >= D2) {
    throw new Error("column index out of bounds");
  }

  const slice = new Float32Array(D3);

  for (let k = 0; k < D3; k++) {
    const index = columnIndex * D3 + k;
    slice[k] = tensor.cpuData[index];
  }

  return slice;
}

function softmax(arr: Float32Array) {
  const exps = arr.map((x) => Math.exp(x));
  const sumExps = exps.reduce((sum, x) => sum + x);
  return exps.map((x) => x / sumExps);
}

export async function predict(
  chords: {
    index: number;
    token: number;
    duration: number;
    variant: number;
  }[],
  modelPath: string,
  style?: number[],
) {
  // Process data
  if (chords.length === 0) {
    chords = [{ index: 0, token: -1, duration: 1, variant: 0 }];
  }
  const [numChords, data] = process_chords(chords);

  // Check cache
  let strData = "";
  for (let i = 0; i < (numChords as number); i++) {
    strData += (data as BigInt64Array)[i].toString() + " ";
  }
  strData += modelPath; // The predictions depend on the model used
  if (style) {
    strData += style.join(" ");
  }
  if (predictionCache.has(strData)) {
    return predictionCache.get(strData);
  }

  const resultPromise = new Promise<{ token: number; prob: number }[]>(
    (resolve, reject) => {
      worker.onmessage = (event) => {
        // Handle set calls from the worker (cannot transfer the store directly)
        if (event.data.status === "setDownloadingModel") {
          useStore.getState().setIsDownloadingModel(event.data.value);
        } else if (event.data.status === "setPercentageDownloaded") {
          useStore.getState().setPercentageDownloaded(event.data.value);
        } else if (event.data.status === "setModelSize") {
          useStore.getState().setModelSize(event.data.value);
        } else if (event.data.status === "setIsLoadingSession") {
          useStore.getState().setIsLoadingSession(event.data.value);
        }

        // Handle the output
        if (event.data.status === "modelLoaded") {
          // Predict after the model is loaded
          worker.postMessage({ action: "predict", data: data, style });
        } else if (event.data.output) {
          const { output } = event.data;
          /* Process the output */
          const column = getColumnSlice(
            output as ort.Tensor,
            (numChords as number) - 1,
          ); // Only a single column is needed

          // Zero out the start and end tokens, as well as the previous chord
          column[numTokens - 1] = -Infinity;
          column[numTokens - 2] = -Infinity;
          column[chords[chords.length - 1].token] = -Infinity;

          // Get the softmax probabilities
          const probs = softmax(column);

          // Convert it to the wanted format, skip the start and end tokens
          let chordProbs = [];
          for (let i = 0; i < probs.length - 2; i++) {
            chordProbs.push({ token: i, prob: probs[i] });
          }

          // Process or sort the predictions
          if (numChords === 1) {
            chordProbs = processFirstPreds(chordProbs);
          } else {
            chordProbs.sort((a, b) => b.prob - a.prob);
          }

          // Cache the result
          predictionCache.set(strData, chordProbs);

          // Clear the first element of the cache if it's too big
          if (predictionCache.size > maxCacheSize) {
            predictionCache.delete(predictionCache.keys().next().value);
          }

          resolve(chordProbs);
        }
      };

      worker.onerror = (error) => {
        reject(error);
      };
    },
  );

  // Load the model or predict
  if (!prevModelPath || prevModelPath !== modelPath) {
    prevModelPath = modelPath;
    worker.postMessage({ action: "loadModel", modelPath });
  } else {
    worker.postMessage({ action: "predict", data: data, style });
  }

  return resultPromise;
}

// Tokens that are transpositions of one another should have the same probability, so we average them and sort
function processFirstPreds(
  chordProbs: { token: number; prob: number }[],
): { token: number; prob: number }[] {
  const newChordProbs: { token: number; prob: number }[] = [];
  for (let i = 0; i < chordProbs.length; i++) {
    const chord = chordProbs[i];

    // If the token is already in the new list, skip it
    if (newChordProbs.find((c) => c.token === chord.token)) continue;

    // Average the probabilities of the transpositions
    let summedProb = 0;
    for (let j = 0; j < transpositionMap[chord.token].length; j++) {
      const transposedToken = transpositionMap[chord.token][j];
      summedProb +=
        chordProbs.find((c) => c.token === transposedToken)?.prob || 0;
    }

    for (let j = 0; j < transpositionMap[chord.token].length; j++) {
      if (
        newChordProbs.find((c) => c.token === transpositionMap[chord.token][j])
      )
        continue;
      newChordProbs.push({
        token: transpositionMap[chord.token][j],
        prob: summedProb / 12,
      });
    }
  }

  // Sort the new list by probability, else sort by name
  newChordProbs.sort((a, b) => {
    if (a.prob === b.prob) {
      return getRootNoteValue(a.token) - getRootNoteValue(b.token);
    }
    return b.prob - a.prob;
  });

  return newChordProbs;
}

function getRootNoteValue(token: number) {
  const noteOrder = ["C", "D", "E", "F", "G", "A", "B"];
  const rootNote = tokenToChord[token][0][0];
  // Sharp notes are offset by 1 instead of using custom checks (the implementation is easier this way)
  return (
    noteOrder.indexOf(rootNote) * 2 +
    (tokenToChord[token][0][1] === "#" ? 1 : 0)
  );
}
