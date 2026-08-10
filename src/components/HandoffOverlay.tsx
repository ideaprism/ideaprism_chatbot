"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { useEffect } from "react";

import { CharacterAvatar } from "./CharacterAvatar";
import { getCharacter, type CharacterId } from "@/lib/characters";

/** 배턴터치 연출 (PRD F-2) — 담당 캐릭터가 바뀔 때 잠깐 뜬다 */
export function HandoffOverlay({
  handoff,
  onDone,
}: {
  handoff: { from: CharacterId; to: CharacterId } | null;
  onDone: () => void;
}) {
  useEffect(() => {
    if (!handoff) return;
    const timer = setTimeout(onDone, 2400);
    return () => clearTimeout(timer);
  }, [handoff, onDone]);

  return (
    <AnimatePresence>
      {handoff && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-40 flex items-center justify-center bg-neutral-900/35 backdrop-blur-sm"
          onClick={onDone}
        >
          <motion.div
            initial={{ scale: 0.9, y: 12 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 22 }}
            className="flex items-center gap-6 rounded-3xl bg-white px-10 py-8 shadow-xl"
          >
            <Face id={handoff.from} muted />
            <motion.div
              animate={{ x: [0, 8, 0] }}
              transition={{ repeat: Infinity, duration: 1.2 }}
              className="text-neutral-300"
            >
              <ArrowRight className="size-7" />
            </motion.div>
            <Face id={handoff.to} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Face({ id, muted = false }: { id: CharacterId; muted?: boolean }) {
  const meta = getCharacter(id);
  return (
    <div className={muted ? "text-center opacity-45" : "text-center"}>
      <CharacterAvatar character={id} size={88} className="mx-auto" />
      <p className="mt-2 text-sm font-semibold">{meta.name}</p>
      {!muted && <p className="mt-0.5 text-[11px] text-neutral-500">이제 함께해요</p>}
    </div>
  );
}
