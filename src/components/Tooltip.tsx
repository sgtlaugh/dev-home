import React, { useState, useCallback, useRef, useEffect } from "react";
import { createPortal } from "react-dom";

interface TooltipProps {
  text: string;
  children: React.ReactNode;
  position?: "top" | "bottom";
}

const OFFSET_Y = 8;
const EDGE_PADDING = 8;

export const Tooltip: React.FC<TooltipProps> = ({ text, children, position = "top" }) => {
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const tipRef = useRef<HTMLDivElement>(null);
  const [adjusted, setAdjusted] = useState({ x: 0, y: 0 });

  const handleMouseEnter = useCallback(() => setVisible(true), []);
  const handleMouseLeave = useCallback(() => setVisible(false), []);
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    setCoords({ x: e.clientX, y: e.clientY });
  }, []);
  const handleClickCapture = useCallback(() => setVisible(false), []);

  useEffect(() => {
    if (!visible || !tipRef.current) return;
    const tip = tipRef.current;
    const rect = tip.getBoundingClientRect();
    let x = coords.x - rect.width / 2;
    let y = position === "bottom" ? coords.y + OFFSET_Y : coords.y - rect.height - OFFSET_Y;

    if (x < EDGE_PADDING) x = EDGE_PADDING;
    if (x + rect.width > window.innerWidth - EDGE_PADDING)
      x = window.innerWidth - EDGE_PADDING - rect.width;
    if (y < EDGE_PADDING) y = coords.y + OFFSET_Y;

    setAdjusted({ x, y });
  }, [visible, coords, position]);

  if (!text) return <>{children}</>;

  const eventProps = {
    onMouseEnter: handleMouseEnter,
    onMouseLeave: handleMouseLeave,
    onMouseMove: handleMouseMove,
    onClickCapture: handleClickCapture,
  };

  let trigger: React.ReactNode;
  if (React.isValidElement(children) && React.Children.count(children) === 1) {
    trigger = React.cloneElement(
      children as React.ReactElement<Record<string, unknown>>,
      eventProps,
    );
  } else {
    trigger = <span {...eventProps}>{children}</span>;
  }

  return (
    <>
      {trigger}
      {visible &&
        createPortal(
          <div ref={tipRef} className="js-tooltip" style={{ left: adjusted.x, top: adjusted.y }}>
            {text}
          </div>,
          document.body,
        )}
    </>
  );
};
