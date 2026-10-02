"use client";

import { useEffect, useState } from "react";
import type { CandlePoint } from "@/lib/forward-book";

function HourChart({
  symbol,
  candles,
  width,
  height,
}: {
  symbol: string;
  candles: CandlePoint[];
  width: number;
  height: number;
}) {
  const compact = width < 400;
  const padLeft = compact ? 48 : 62;
  const padRight = 8;
  const padTop = 10;
  const axisHeight = compact ? 28 : 36;
  const plotBottom = height - axisHeight;
  const highs = candles.map((bar) => bar.high);
  const lows = candles.map((bar) => bar.low);
  const emaValues = candles.map((bar) => bar.ema50).filter((value): value is number => value != null);
  const rawMax = Math.max(...highs, ...emaValues);
  const rawMin = Math.min(...lows, ...emaValues);
  const cushion = (rawMax - rawMin) * 0.08 || 1;
  const max = rawMax + cushion;
  const min = rawMin - cushion;
  const span = max - min || 1;
  const slot = (width - padLeft - padRight) / candles.length;
  const y = (price: number) => padTop + ((max - price) / span) * (plotBottom - padTop);
  const levelCount = compact ? 3 : 5;
  const priceLevels = Array.from({ length: levelCount }, (_, index) => max - (index / (levelCount - 1)) * (max - min));
  const shadedIndexes = candles.map((bar, index) => (bar.highlight ? index : -1)).filter((index) => index >= 0);
  const shadeStart = shadedIndexes[0];
  const shadeEnd = shadedIndexes[shadedIndexes.length - 1];
  const supportLow = candles.find((bar) => bar.highlight)?.low;
  const labelCount = width < 400 ? 3 : 8;
  const labelIndexes = new Set(
    Array.from({ length: labelCount }, (_, slot) => Math.round((slot * (candles.length - 1)) / (labelCount - 1))),
  );
  let emaStarted = false;
  const emaPath = candles
    .map((bar, index) => {
      if (bar.ema50 == null) return null;
      const command = emaStarted ? "L" : "M";
      emaStarted = true;
      return `${command} ${padLeft + index * slot + slot / 2} ${y(bar.ema50)}`;
    })
    .filter((part): part is string => part != null)
    .join(" ");

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`${symbol} 30-minute candles with price, date, and time`}
      className="bg-[var(--wash)]"
    >
      {priceLevels.map((price) => (
        <g key={price}>
          <line
            x1={padLeft}
            x2={width - padRight}
            y1={y(price)}
            y2={y(price)}
            stroke="#d7e3dc"
            strokeWidth={1}
          />
          <text
            x={padLeft - 4}
            y={y(price)}
            textAnchor="end"
            dominantBaseline="middle"
            fontSize={compact ? 8 : 11}
            fill="#5d7266"
          >
            {price.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </text>
        </g>
      ))}
      {shadeStart != null && shadeEnd != null && (
        <rect
          x={padLeft + shadeStart * slot}
          y={padTop}
          width={(shadeEnd - shadeStart + 1) * slot}
          height={plotBottom - padTop}
          fill="rgba(27, 122, 78, 0.18)"
        />
      )}
      {supportLow != null && (
        <line
          x1={padLeft}
          x2={width - padRight}
          y1={y(supportLow)}
          y2={y(supportLow)}
          stroke="#1b7a4e"
          strokeDasharray="3 3"
          strokeWidth={1}
        />
      )}
      {emaPath && <path d={emaPath} fill="none" stroke="#1a7a72" strokeWidth={1.25} />}
      {candles.map((bar, index) => {
        const up = bar.close >= bar.open;
        const color = up ? "#1b7a4e" : "#b42318";
        const x = padLeft + index * slot + slot / 2;
        const bodyTop = y(Math.max(bar.open, bar.close));
        const bodyBottom = y(Math.min(bar.open, bar.close));
        const showLabel = labelIndexes.has(index);
        const [day, time] = bar.date.split(" ");
        const [, month, date] = day.split("-");
        const anchor = index === 0 ? "start" : index === candles.length - 1 ? "end" : "middle";
        return (
          <g key={bar.date}>
            <line x1={x} x2={x} y1={y(bar.high)} y2={y(bar.low)} stroke={color} strokeWidth={1} />
            <rect
              x={x - Math.max(0.8, slot * 0.28)}
              y={bodyTop}
              width={Math.max(1.2, slot * 0.56)}
              height={Math.max(1, bodyBottom - bodyTop)}
              fill={color}
            />
            {showLabel && (
              <text x={x} y={height - 4} textAnchor={anchor} fontSize={width < 400 ? 8 : 10} fill="#5d7266">
                {`${date}/${month} ${time}`}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export function CandleSnapshot({
  symbol,
  candles,
  source,
  href,
}: {
  symbol: string;
  candles: CandlePoint[];
  source: string;
  href: string;
}) {
  const [open, setOpen] = useState(false);
  const shaded = candles.some((bar) => bar.highlight);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (candles.length < 2) {
    return (
      <figure className="w-[300px] max-w-[300px]">
        <p className="text-xs text-[var(--muted)]">30-minute snapshot unavailable.</p>
        <figcaption className="mt-1 text-[10px] leading-snug text-[var(--muted)]">Source: {source}.</figcaption>
      </figure>
    );
  }

  const note = shaded
    ? "Shade runs from the pullback that tagged the rising 50-bar EMA through the bar momentum resumed."
    : "The buy bars are outside this window.";

  return (
    <figure className="w-[300px] max-w-[300px]">
      <button
        type="button"
        className="block w-full cursor-zoom-in border-0 bg-transparent p-0"
        aria-label={`Open larger ${symbol} 30-minute chart`}
        onClick={() => setOpen(true)}
      >
        <HourChart symbol={symbol} candles={candles} width={300} height={132} />
      </button>
      <figcaption className="mt-1 text-[10px] leading-snug text-[var(--muted)]">
        Source: {source}. {note}{" "}
        <a className="underline" href={href} target="_blank" rel="noreferrer">
          Yahoo Finance chart
        </a>
      </figcaption>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`${symbol} 30-minute chart`}
            className="w-full max-w-5xl border border-[var(--line)] bg-white p-4"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-sm text-[var(--ink)]">{symbol} · 30-minute candles</p>
              <button type="button" className="px-2 py-1 text-sm text-[var(--muted)]" onClick={() => setOpen(false)}>
                Close
              </button>
            </div>
            <HourChart symbol={symbol} candles={candles} width={860} height={440} />
            <p className="mt-3 text-xs leading-relaxed text-[var(--muted)]">
              Source: {source}. {note} The daily reversal rule still decides the lead and the entry.
            </p>
          </div>
        </div>
      )}
    </figure>
  );
}
