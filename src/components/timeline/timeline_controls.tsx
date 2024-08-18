"use client";
import React, { useState, useEffect, useRef } from "react";
import { useStore } from "@/state/use_store";
import { useIsMount } from "@/state/use_is_mount";
import { shallow } from "zustand/shallow";
import * as Tone from "tone";

import { playChord, playSequence, stopPlayback } from "@/playback/player";

import SettingsDropdown from "./settings_dropdown";
import DeleteAllDropdown from "./delete_all_dropdown";
import StepByStepTutorial from "../overlays/step_by_step_tutorial";
import { tokenToChord } from "@/data/token_to_chord";

interface Props {
  timelineWidth: number;
  stateWindowLength: number;
  playing: boolean;
  setPlaying: (state: boolean) => void;
}

export default function TimelineControls({
  timelineWidth,
  stateWindowLength,
  playing,
  setPlaying,
}: Props) {
  const [
    chords,
    selectedChord,
    setSelectedChord,
    addChord,
    deleteChord,
    clearChords,
    signature,
    zoom,
    timelinePosition,
    setTimelinePosition,
    playheadPosition,
    setPlayheadPosition,
    stateWindowIndex,
    undo,
    redo,
    muteMetronome,
    setMuteMetronome,
    bpm,
    setBpm,
    loop,
    setLoop,
    initializePlayback,
    enabledShortcuts,
    setSelectedToken,
    setSelectedVariant,
    setVariantsOpen,
    setSelectedChordVariants,
    setIsVariantsOpenFromSuggestions,
  ] = useStore(
    (state) => [
      state.chords,
      state.selectedChord,
      state.setSelectedChord,
      state.addChord,
      state.deleteChord,
      state.clearChords,
      state.signature,
      state.zoom,
      state.timelinePosition,
      state.setTimelinePosition,
      state.playheadPosition,
      state.setPlayheadPosition,
      state.stateWindowIndex,
      state.undo,
      state.redo,
      state.muteMetronome,
      state.setMuteMetronome,
      state.bpm,
      state.setBpm,
      state.loop,
      state.setLoop,
      state.initializePlayback,
      state.enabledShortcuts,
      state.setSelectedToken,
      state.setSelectedVariant,
      state.setVariantsOpen,
      state.setSelectedChordVariants,
      state.setIsVariantsOpenFromSuggestions,
    ],
    shallow
  );

  // Initialize the playback when the storage is hydrated
  useEffect(() => {
    const unsubscribe = useStore.persist.onHydrate(() => {
      initializePlayback();
    });

    // In case the storage is already hydrated
    if (useStore.persist.hasHydrated()) {
      initializePlayback();
    }

    return () => {
      unsubscribe();
    };
  }, [initializePlayback]);

  /* Shortcuts */
  const enabledShortcutsRef = useRef(enabledShortcuts);

  useEffect(() => {
    enabledShortcutsRef.current = enabledShortcuts;
  }, [enabledShortcuts]);

  // Mapping keys to their handler functions
  const keyEventHandlers: Record<string, () => void> = {
    KeyM: changeMetronome,
    Space: changePlaying,
    KeyS: () => {
      setIsPlaybackSettingsOpen(!isPlaybackSettingsOpenRef.current);
    },
    KeyL: () => {
      const newState = !loopRef.current;
      setLoop(newState);
    },
    KeyZ_Ctrl: undo,
    KeyY_Ctrl: redo,
    KeyV: () => {
      if (selectedChord !== -1 && chords[selectedChord].token !== -1) {
        setSelectedToken(chords[selectedChord].token);
        setSelectedVariant(chords[selectedChord].variant);
        setSelectedChordVariants(selectedChord);
        setIsVariantsOpenFromSuggestions(false);
        setVariantsOpen(true);
      }
    },
    Delete: deleteChord,
    Delete_Ctrl: () => {
      if (isDeleteAllOpenRef.current) clearChords();
      setIsDeleteAllOpen(!isDeleteAllOpenRef.current);
    },
    KeyA: addChordAndScroll,
    ArrowLeft: () => moveSelection("left"),
    ArrowRight: () => moveSelection("right"),
    ArrowUp: () => {
      // Increase the BPM by 1
      if (isPlaybackSettingsOpenRef.current) {
        const input = playbackSettingsRef.current?.querySelector(
          "input[type=number]"
        ) as HTMLInputElement;
        if (!input) return;
        input.value = Math.min(400, parseInt(input.value) + 1).toString();

        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          "value"
        )?.set;
        nativeInputValueSetter?.call(input, input.value);

        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
    },
    ArrowDown: () => {
      // Decrease the BPM by 1
      if (isPlaybackSettingsOpenRef.current) {
        const input = playbackSettingsRef.current?.querySelector(
          "input[type=number]"
        ) as HTMLInputElement;
        if (!input) return;
        input.value = Math.max(10, parseInt(input.value) - 1).toString();

        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          "value"
        )?.set;
        nativeInputValueSetter?.call(input, input.value);

        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
    },
    Enter: () => handleEnterKey(),
    NumpadEnter: () => handleEnterKey(),
    Escape: () => {
      if (isPlaybackSettingsOpenRef.current) setIsPlaybackSettingsOpen(false);
      if (isDeleteAllOpenRef.current) setIsDeleteAllOpen(false);
      if (selectedChord !== -1) setSelectedChord(-1);
    },
  };

  const handleEnterKey = () => {
    if (isDeleteAllOpenRef.current) {
      clearChords();
      setIsDeleteAllOpen(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    // Based on the key, call the corresponding handler function
    const key = event.code;
    const action =
      key + (event.altKey ? "_Alt" : "") + (event.ctrlKey ? "_Ctrl" : "");

    if (!enabledShortcutsRef.current) return;

    if (keyEventHandlers[action]) {
      event.preventDefault();
      keyEventHandlers[action]();
    }
  };

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    chords,
    selectedChord,
    playing,
    signature,
    muteMetronome,
    timelinePosition,
    zoom,
  ]);

  /* Timeline utilities */
  function addChordAndScroll() {
    // Add the chord and scroll to it
    const newChords = addChord();

    scrollToChord(
      newChords,
      selectedChord === -1 ? newChords.length - 1 : selectedChord + 1
    );
  }

  // Move the selection (e.g. from chord 1 to chord 2)
  function moveSelection(direction: "left" | "right") {
    let newValue = selectedChord + (direction === "left" ? -1 : 1);

    if (selectedChord === chords.length - 1 && direction === "right")
      newValue = -1;
    if (selectedChord === -1 && direction === "right") newValue = 0;
    if (selectedChord === -1 && direction === "left")
      newValue = chords.length - 1;

    newValue = Math.max(Math.min(newValue, chords.length - 1), -1);

    setSelectedChord(newValue);

    if (newValue !== -1 && chords[newValue].token !== -1)
      playChord(tokenToChord[chords[newValue].token][chords[newValue].variant]);
  }

  // Scroll to the selected chord when the selection changes, but not on mount
  const isMount = useIsMount();
  useEffect(() => {
    if (selectedChord === -1 || chords.length === 0 || isMount) return;
    scrollToChord(chords, selectedChord);
  }, [selectedChord]);

  // Keep track of the timeline width
  const timelineWidthRef = useRef(timelineWidth);

  useEffect(() => {
    timelineWidthRef.current = timelineWidth;
  }, [timelineWidth]);

  function scrollToChord(
    currChords: {
      index: number;
      token: number;
      duration: number;
      variant: number;
    }[],
    id: number
  ) {
    // Calculate the total duration of all chords before the selected chord
    let totalChordsDuration = 0;
    for (let i = 0; i < currChords.length; i++) {
      totalChordsDuration += currChords[i].duration;
      if (i === id) break;
    }

    // Calculate the size of the chord in pixels
    const totalChordsSize =
      (totalChordsDuration / 4 / signature[0]) * zoom * 10 * signature[1];
    const currentChordSize =
      (currChords[id].duration / 4 / signature[0]) * zoom * 10 * signature[1];

    // If the chord is out of view, scroll to it
    const offset = 2;
    if (
      totalChordsSize >
      -timelinePosition + timelineWidthRef.current - offset
    ) {
      setTimelinePosition(-totalChordsSize + timelineWidthRef.current - offset);
    }
    if (totalChordsSize < -timelinePosition + currentChordSize) {
      setTimelinePosition(-totalChordsSize + currentChordSize);
    }
  }

  /* Playback utilities */
  const playheadPositionRef = React.useRef(playheadPosition);

  useEffect(() => {
    playheadPositionRef.current = playheadPosition;
  }, [playheadPosition]);

  // Data has to be passed to the playback, so we handle it this way
  function changePlaying() {
    Tone.start(); // Start the audio context (browsers can only start sounds on user interaction)
    if (playing) {
      stopPlayback();
    } else {
      playSequence(
        chords,
        playheadPositionRef.current,
        setPlayheadPosition,
        setPlaying,
        muteMetronome
      );
    }
    setPlaying(!playing);
  }

  // Stop the playback when the chords change
  useEffect(() => {
    if (playing) {
      changePlaying();
    }
  }, [chords]);

  // Change the metronome state
  function changeMetronome() {
    setMuteMetronome(!muteMetronomeRef.current);
  }

  // Keep track of the player states
  const muteMetronomeRef = useRef(muteMetronome);
  useEffect(() => {
    muteMetronomeRef.current = muteMetronome;
  }, [muteMetronome]);

  const bpmRef = useRef(bpm);
  useEffect(() => {
    bpmRef.current = bpm;
  }, [bpm]);

  const loopRef = useRef(loop);
  useEffect(() => {
    loopRef.current = loop;
  }, [loop]);

  /* Dropdowns */
  const [isPlaybackSettingsOpen, setIsPlaybackSettingsOpen] = useState(false);
  const isPlaybackSettingsOpenRef = useRef(isPlaybackSettingsOpen);

  const playbackSettingsRef = useRef<HTMLDivElement>(null);
  const openPlaybackSettingsButtonRef = useRef<HTMLButtonElement>(null);

  const [isDeleteAllOpen, setIsDeleteAllOpen] = useState(false);
  const isDeleteAllOpenRef = useRef(isDeleteAllOpen);

  const deleteAllRef = useRef<HTMLDivElement>(null);
  const openDeleteAllButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    isPlaybackSettingsOpenRef.current = isPlaybackSettingsOpen;
  }, [isPlaybackSettingsOpen]);

  useEffect(() => {
    isDeleteAllOpenRef.current = isDeleteAllOpen;
  }, [isDeleteAllOpen]);

  useEffect(() => {
    // Hide the dropdown on click outside
    const handleClickOutside = (e: MouseEvent) => {
      if (
        isPlaybackSettingsOpenRef.current &&
        !openPlaybackSettingsButtonRef.current?.contains(e.target as Node) &&
        !playbackSettingsRef.current?.contains(e.target as Node)
      ) {
        setIsPlaybackSettingsOpen(false);
      }

      if (
        isDeleteAllOpenRef.current &&
        !openDeleteAllButtonRef.current?.contains(e.target as Node) &&
        !deleteAllRef.current?.contains(e.target as Node)
      ) {
        setIsDeleteAllOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const addButtonRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="grid grid-cols-[7fr_13fr] justify-stretch h-[8dvh] min-w-[50%] max-w-[70dvh] space-x-[2dvh]">
      <div className="w-full h-[8dvh] relative bg-zinc-950 rounded-t-[0.5dvw] flex flex-row justify-evenly p-[2dvh]">
        <button
          className={`w-full h-full select-none ${
            muteMetronome && "filter brightness-75"
          } flex flex-col justify-center items-center`}
          title="Metronome (M)"
          onClick={() => changeMetronome()}
        >
          <img src="/metronome.svg" alt="Settings" className="h-full w-full" />
        </button>
        <button
          className="w-full h-full select-none filter active:brightness-90 flex flex-col justify-center items-center"
          title={`${playing ? "Pause" : "Play"} (Space)`}
          onClick={() => changePlaying()}
        >
          <img
            src={playing ? "/pause.svg" : "/play.svg"}
            alt="Play"
            className="h-full w-full"
          />
        </button>
        <button
          className="w-full h-full select-none filter active:brightness-90 flex flex-col justify-center items-center"
          title="Playback settings (S)"
          onClick={() => setIsPlaybackSettingsOpen(!isPlaybackSettingsOpen)}
          ref={openPlaybackSettingsButtonRef}
        >
          <img src="/settings.svg" alt="Settings" className="h-full w-full" />
        </button>
        {isPlaybackSettingsOpen && (
          <SettingsDropdown
            dropdownRef={playbackSettingsRef}
            loop={loop}
            setLoop={setLoop}
            bpm={bpm}
            setBpm={setBpm}
          />
        )}
      </div>
      <div className="w-full h-[8dvh] relative bg-zinc-950 rounded-t-[0.5dvw] flex flex-row justify-evenly p-[2dvh]">
        <button
          className="w-full h-full select-none filter active:brightness-90 disabled:brightness-75 flex flex-col justify-center items-center"
          disabled={stateWindowIndex <= 0}
          title="Undo (Ctrl+Z)"
          onClick={() => undo()}
        >
          <img src="/undo.svg" alt="Undo" className="h-full w-full" />
        </button>
        <button
          className="w-full h-full select-none filter active:brightness-90 disabled:brightness-75 flex flex-col justify-center items-center"
          disabled={stateWindowIndex === stateWindowLength - 1}
          title="Redo (Ctrl+Y)"
          onClick={() => redo()}
        >
          <img src="/redo.svg" alt="Redo" className="h-full w-full" />
        </button>
        <button
          className="w-full h-full select-none filter active:brightness-90 disabled:brightness-75 flex flex-col justify-center items-center"
          disabled={selectedChord === -1 || chords[selectedChord].token === -1}
          title="Open chord variants (V)"
          onClick={() => {
            setSelectedToken(chords[selectedChord].token);
            setSelectedVariant(chords[selectedChord].variant);
            setSelectedChordVariants(selectedChord);
            setIsVariantsOpenFromSuggestions(false);
            setVariantsOpen(true);
          }}
        >
          <img src="/variants.svg" alt="Variants" className="h-full w-full" />
        </button>
        <button
          className="w-full h-full select-none filter active:brightness-90 disabled:brightness-75 flex flex-col justify-center items-center"
          disabled={selectedChord === -1}
          title="Delete chord (Del)"
          onClick={() => deleteChord()}
        >
          <img src="/trash.svg" alt="Delete" className="h-full w-full" />
        </button>
        <button
          className="w-full h-full select-none filter active:brightness-90 disabled:brightness-75 flex flex-col justify-center items-center"
          title="Delete all chords (Ctrl+Del)"
          onClick={() => setIsDeleteAllOpen(!isDeleteAllOpen)}
          ref={openDeleteAllButtonRef}
        >
          <img src="/trash-all.svg" alt="Delete" className="h-full w-full" />
        </button>
        <button
          className="w-full h-full select-none filter active:brightness-90 flex flex-col justify-center items-center"
          title="Add chord (A)"
          onClick={() => addChordAndScroll()}
          ref={addButtonRef}
        >
          <img src="/plus.svg" alt="Add" className="h-full w-full" />
        </button>
        <StepByStepTutorial
          step={0}
          text="Add a blank chord by clicking on the plus icon"
          position="below"
          elementRef={addButtonRef}
          canContinue={chords.length > 0}
          autoContinue={true}
        />
        <StepByStepTutorial
          step={4}
          text="Add another chord"
          position="below"
          elementRef={addButtonRef}
          canContinue={chords.length > 1}
          autoContinue={true}
        />
        {isDeleteAllOpen && (
          <DeleteAllDropdown
            dropdownRef={deleteAllRef}
            setIsOpen={setIsDeleteAllOpen}
          />
        )}
      </div>
    </div>
  );
}
