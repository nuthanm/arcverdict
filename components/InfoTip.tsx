"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { tipFor, type TipKey } from "@/lib/copy";

export function InfoTip({ tipKey, align = "start" }: { tipKey: TipKey; align?: "start" | "end" }) {
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const tip = tipFor(tipKey);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;

    function place() {
      const trigger = triggerRef.current;
      const panel = panelRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const width = panel?.offsetWidth || 288;
      const height = panel?.offsetHeight || 220;
      const margin = 8;
      let left = align === "end" ? rect.right - width : rect.left;
      left = Math.min(Math.max(margin, left), window.innerWidth - width - margin);
      let top = rect.bottom + 6;
      if (top + height > window.innerHeight - margin && rect.top - height - 6 > margin) {
        top = rect.top - height - 6;
      }
      setCoords({ top, left });
    }

    place();
    const frame = requestAnimationFrame(place);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, align]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setPinned(false);
      setOpen(false);
    }

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setPinned(false);
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    return () => {
      if (hideTimer.current != null) window.clearTimeout(hideTimer.current);
    };
  }, []);

  function show() {
    if (hideTimer.current != null) window.clearTimeout(hideTimer.current);
    setOpen(true);
  }

  function hideIfUnpinned() {
    if (pinned) return;
    if (hideTimer.current != null) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setOpen(false), 140);
  }

  const panel =
    mounted && open ? (
      createPortal(
        <div
          ref={panelRef}
          id={id}
          role="tooltip"
          className="info-tip"
          style={{ top: coords?.top ?? -9999, left: coords?.left ?? -9999 }}
          onMouseEnter={show}
          onMouseLeave={hideIfUnpinned}
        >
          <p className="info-tip-title">{tip.title}</p>
          <p className="info-tip-kicker">Meaning</p>
          <p className="info-tip-body">{tip.meaning}</p>
          <p className="info-tip-kicker">When to act</p>
          <p className="info-tip-body">{tip.act}</p>
          <p className="info-tip-kicker">Do not</p>
          <p className="info-tip-body">{tip.avoid}</p>
          {tip.extra ? (
            <p className="info-tip-body mt-2 border-t border-[var(--line)] pt-2 text-[var(--muted)]">{tip.extra}</p>
          ) : null}
        </div>,
        document.body,
      )
    ) : null;

  return (
    <span className="relative inline-flex align-middle">
      <button
        ref={triggerRef}
        type="button"
        className="info-tip-btn"
        aria-label={`What this means: ${tip.title}`}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onMouseEnter={show}
        onMouseLeave={hideIfUnpinned}
        onFocus={show}
        onBlur={hideIfUnpinned}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          event.preventDefault();
          if (pinned) {
            setPinned(false);
            setOpen(false);
            return;
          }
          setPinned(true);
          show();
        }}
      >
        i
      </button>
      {panel}
    </span>
  );
}

export function HintLabel({
  tipKey,
  children,
  align,
  className = "",
}: {
  tipKey: TipKey;
  children: ReactNode;
  align?: "start" | "end";
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      {children}
      <InfoTip tipKey={tipKey} align={align} />
    </span>
  );
}

export function HintCorner({
  tipKey,
  align = "end",
}: {
  tipKey: TipKey;
  align?: "start" | "end";
}) {
  return (
    <span className="info-tip-corner">
      <InfoTip tipKey={tipKey} align={align} />
    </span>
  );
}
