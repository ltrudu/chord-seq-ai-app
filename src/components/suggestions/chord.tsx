import { useEffect, useRef } from "react";
import { tokenToChord } from "@/data/token_to_chord";

// Interpolate between violet and black
const color = (t: number) => {
  const violet = [139, 92, 246];
  const black = [0, 0, 0];
  const r = violet[0] * (1 - t) + black[0] * t;
  const g = violet[1] * (1 - t) + black[1] * t;
  const b = violet[2] * (1 - t) + black[2] * t;
  return `rgb(${r}, ${g}, ${b})`;
};

interface Props {
  index: number;
  token: number;
  variant: number;
  prob: number;
  decayFactor: number;
  playChord: (chord: string) => void;
  replaceChord: (token: number, variant: number) => void;
  setSelectedToken: (token: number) => void;
  setSelectedVariant: (variant: number) => void;
  setVariantsOpen: (open: boolean) => void;
  setIsVariantsOpenFromSuggestions: (
    isVariantsOpenFromSuggestions: boolean
  ) => void;
}

export default function Chord({
  token,
  variant,
  prob,
  decayFactor,
  playChord,
  replaceChord,
  setSelectedToken,
  setSelectedVariant,
  setVariantsOpen,
  setIsVariantsOpenFromSuggestions,
}: Props) {
  /* Variants */
  // Open variants on button click
  const tokenRef = useRef(token);
  const variantRef = useRef(variant);

  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  useEffect(() => {
    variantRef.current = variant;
  }, [variant]);

  return (
    <button
      className="relative group flex flex-row justify-center items-center space-x-[0.2dvw] p-[1dvw] rounded-[0.5dvw] w-full overflow-hidden outline-none filter active:brightness-90 hover:filter hover:brightness-110 max-h-[5dvw]"
      style={{
        // Interpolate between violet and black logarithmically
        backgroundColor: color(
          1 - (Math.log(prob + Number.EPSILON) + decayFactor) / decayFactor
        ),
        minHeight: "5dvw",
      }}
      title={`Replace selected with ${tokenToChord[token][variant]} (${(
        prob * 100
      ).toFixed(2)}%${
        variant !== 0 ? `; variant of ${tokenToChord[token][0]}` : ""
      }${
        prob === 0 ? "; same as previous" : "" // The probability can be 0 only in that case (because of model's softmax function)
      })`}
      onClick={() => {
        playChord(tokenToChord[token][variant]);
        replaceChord(token, variant);
      }}
    >
      {/* Chord name - styling to handle overflow with the icon */}
      <div className="w-full">
        <div className="text-center group-hover:mx-[2.1dvw]">
          <div className="overflow-left">
            <span className="inline-block whitespace-nowrap">
              {tokenToChord[token][variant]}
            </span>
          </div>
        </div>
      </div>

      <button
        className="absolute right-[1dvw] invisible group-hover:visible w-[2dvw] h-[2dvw] select-none filter brightness-90 flex flex-col justify-center items-center"
        title="Open chord variants"
        onClick={() => {
          setSelectedToken(tokenRef.current);
          setSelectedVariant(variantRef.current);
          setIsVariantsOpenFromSuggestions(true);
          setVariantsOpen(true);
        }}
      >
        <img src="/variants.svg" alt="Variants" className="h-full w-full" />
      </button>
    </button>
  );
}
