"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { ReactNode } from "react";

/**
 * 2패널 전환 골격 (PRD S-3).
 * 패널이 없으면 채팅이 화면 전체를 쓰고, 패널이 생기면 채팅이 좌측으로 줄어든다.
 * P1에서 검색 결과 패널을 이 자리에 끼운다.
 */
export function WorkspaceShell({
  chat,
  panel,
}: {
  chat: ReactNode;
  panel?: ReactNode;
}) {
  const open = Boolean(panel);

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <motion.section
        layout
        transition={{ type: "spring", stiffness: 220, damping: 30 }}
        className="flex min-w-0 flex-col"
        style={{ flexBasis: open ? "36%" : "100%", flexGrow: open ? 0 : 1 }}
      >
        {chat}
      </motion.section>

      <AnimatePresence>
        {open && (
          <motion.aside
            key="panel"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 24 }}
            transition={{ duration: 0.24 }}
            className="flex min-w-0 flex-1 flex-col border-l border-line bg-panel"
          >
            {panel}
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}
