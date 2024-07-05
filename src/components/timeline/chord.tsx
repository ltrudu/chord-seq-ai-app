"use client";
import React, { useState, useEffect, useRef, use } from "react";
import { useStore } from "@/state/use_store";
import { shallow } from "zustand/shallow";

import { tokenToChord } from "@/data/token_to_chord";
import { playChord } from "@/playback/player";

interface Props {
  index: number;
  token: number;
  duration: number;
  variant: number;
}

export default function Chord({ index, token, duration, variant }: Props) {
  const [
    chords,
    setChords,
    selectedChord,
    setSelectedChord,
    signature,
    zoom,
    resizingAnyChord,
    setResizingChord,
  ] = useStore(
    (state) => [
      state.chords,
      state.setChords,
      state.selectedChord,
      state.setSelectedChord,
      state.signature,
      state.zoom,
      state.resizingChord,
      state.setResizingChord,
    ],
    shallow
  );

  const chordElementRef = useRef<HTMLButtonElement>(null);

  /* Units */
  let oneDvwInPx = window.innerWidth / 100;

  // Update on window resize
  useEffect(() => {
    const handleResize = () => {
      oneDvwInPx = window.innerWidth / 100;
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  function pxToDvw(px: number) {
    return px / oneDvwInPx;
  }

  /* Resizing state */
  // Keep track of which chord is being resized
  const [resizingThisChord, setResizingThisChord] = useState(false);
  const resizingThisChordRef = useRef(resizingThisChord);
  const resizingAnyChordRef = useRef(resizingAnyChord);

  useEffect(() => {
    resizingThisChordRef.current = resizingThisChord;
  }, [resizingThisChord]);

  useEffect(() => {
    resizingAnyChordRef.current = resizingAnyChord;
  }, [resizingAnyChord]);

  // Keep track of the zoom, chords and signature
  const zoomRef = useRef(zoom);
  const chordsRef = useRef(chords);
  const signatureRef = useRef(signature);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    chordsRef.current = chords;
  }, [chords]);

  useEffect(() => {
    signatureRef.current = signature;
  }, [signature]);

  /* Resizing logic */
  function isAtResizePosition(e: MouseEvent, element: HTMLButtonElement) {
    // Allows resizing only when the mouse is near the right edge of the chord
    const { clientX, clientY } = e;
    const { left, top, width, height } = element.getBoundingClientRect();
    const edgeSize = 10;

    const isNearRightEdge = left + width - clientX < edgeSize;
    const isInBoxVertically = clientY > top && clientY < top + height;

    return isNearRightEdge && isInBoxVertically;
  }

  useEffect(() => {
    const element = chordElementRef.current;
    if (!element) return;

    const handleMouseMove = (e: MouseEvent) => {
      // Indicate that the chord can be resized
      if (isAtResizePosition(e, element) || resizingAnyChordRef.current) {
        element.style.cursor = "ew-resize";
      } else {
        element.style.cursor = "pointer";
      }

      if (!resizingThisChordRef.current) return;

      // Change the duration of the chord based on the mouse position
      let [numerator, denominator] = signatureRef.current;
      // 1 duration means one quarter note and a whole note spans 10 dvw (on zoom 1 and 4/4),
      // so we need to convert the mouse position to a duration
      let newDuration =
        (pxToDvw(e.clientX - element.getBoundingClientRect().left) *
          4 *
          numerator) /
        (10 * zoomRef.current * denominator);

      const stepSize = 4 / denominator;
      newDuration = Math.max(
        Math.round(newDuration / stepSize) * stepSize,
        stepSize
      );

      const newChords = [...chordsRef.current];
      const {
        token: prevToken,
        duration: prevDuration,
        variant: prevVariant,
      } = newChords[index];
      newChords[index] = {
        index: index,
        token: prevToken,
        duration: newDuration,
        variant: prevVariant,
      };

      if (newDuration !== prevDuration) {
        setChords(newChords);
      }
    };

    window.addEventListener("mousemove", handleMouseMove);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, []);

  useEffect(() => {
    const element = chordElementRef.current;
    if (!element) return;

    const handleMouseDown = (e: MouseEvent) => {
      if (isAtResizePosition(e, element) && e.button === 0) {
        setResizingThisChord(true);

        // To prevent saving the chord while resizing (from use_store.tsx)
        setResizingChord(true);
      }
    };

    const handleMouseUp = () => {
      setResizingThisChord(false);

      if (resizingAnyChordRef.current) {
        setResizingChord(false);
        setChords(chordsRef.current);
      }
    };

    element.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      element.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  // Render the chord properly (a whole note (duration 4) on zoom set to 1 and signature 4/4 spans 10dvw)
  let [numerator, denominator] = signature;
  const chordPadding = 0.15; // Space between chords
  const width =
    (duration * 10 * zoom * denominator) / 4 / numerator - chordPadding * 2;

  function changeSelected() {
    if (token !== -1) playChord(tokenToChord[token][variant]);
    if (selectedChord === index) setSelectedChord(-1);
    else setSelectedChord(index);
  }

  return (
    <div
      className={`h-full ${resizingAnyChordRef.current && "cursor-ew-resize"}`}
      style={{ paddingInline: `${chordPadding}dvw` }}
    >
      <button
        className={`${
          token === -1
            ? selectedChord === index
              ? "bg-zinc-700 text-white"
              : "bg-zinc-800 text-zinc-100"
            : selectedChord === index
            ? "bg-violet-500 text-white"
            : "bg-violet-700 text-zinc-100"
        } ${
          resizingAnyChord ? "" : "hover:filter hover:brightness-110"
        } flex justify-center items-center py-[2dvh] rounded-[1dvh] overflow-hidden outline-none h-full min-h-0 min-w-0 whitespace-nowrap`}
        style={{ width: `${width}dvw` }}
        onClick={
          resizingThisChordRef.current
            ? () => {}
            : () => {
                changeSelected();
              }
        }
        ref={chordElementRef}
        title={`${selectedChord === index ? "Des" : "S"}elect this chord`}
      >
        <p className="select-none overflow-hidden">
          {token === -1 ? "?" : tokenToChord[token][variant]}
        </p>
      </button>
    </div>
  );
}
