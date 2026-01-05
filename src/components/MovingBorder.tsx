import React from "react";
import {
  motion,
  useAnimationFrame,
  useMotionTemplate,
  useMotionValue,
  useTransform,
} from "framer-motion";
import { useRef } from "react";
import { cn } from "../lib/utils";

export const MovingBorder = ({
  borderRadius = "1.75rem",
  children,
  as: Component = "div",
  containerClassName,
  borderClassName,
  duration = 2000,
  className,
  colors, // [Color1, Color2] - we'll use Color2 for the moving beam to match original intent
  borderWidth = 1,
  rx,
  ry,
  ...otherProps
}: any) => {
  return (
    <Component
      className={cn(
        "bg-transparent relative text-xl overflow-hidden md:col-span-2",
        containerClassName
      )}
      style={{
        borderRadius: borderRadius,
        padding: borderWidth,
      }}
      {...otherProps}
    >
      <div
        className="absolute inset-0"
        style={{ borderRadius: borderRadius }}
      >
        <MovingBorderCore duration={duration} rx={rx || "30%"} ry={ry || "30%"}>
          <div
            className={cn(
              "h-20 w-20 opacity-[0.8] bg-[radial-gradient(#ffffff_40%,transparent_60%)]",
              borderClassName
            )}
            style={
                colors 
                ? { 
                    background: `linear-gradient(90deg, ${colors[0]} 0%, ${colors[1]} 100%)`,
                    maskImage: `radial-gradient(circle at center, white 50%, transparent 80%)`,
                    WebkitMaskImage: `radial-gradient(circle at center, white 50%, transparent 80%)`,
                    width: '5rem', 
                    height: '5rem'
                  }
                : undefined
            }
          />
        </MovingBorderCore>
      </div>

      <div
        className={cn(
          "relative bg-slate-900/[0.8] border border-slate-800 backdrop-blur-xl text-white flex items-center justify-center w-full h-full text-sm antialiased",
          className
        )}
        style={{
          borderRadius: borderRadius,
        }}
      >
        {children}
      </div>
    </Component>
  );
};

export const MovingBorderCore = ({
  children,
  duration = 2000,
  rx,
  ry,
  ...otherProps
}: any) => {
  const pathRef = useRef<any>();
  const progress = useMotionValue<number>(0);

  useAnimationFrame((time) => {
    const length = pathRef.current?.getTotalLength();
    if (length) {
      const pxPerMillisecond = length / duration;
      progress.set((time * pxPerMillisecond) % length);
    }
  });

  const x = useTransform(
    progress,
    (val) => pathRef.current?.getPointAtLength(val)?.x ?? 0
  );
  const y = useTransform(
    progress,
    (val) => pathRef.current?.getPointAtLength(val)?.y ?? 0
  );

  const transform = useMotionTemplate`translateX(${x}px) translateY(${y}px) translateX(-50%) translateY(-50%)`;

  return (
    <>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="none"
        className="absolute h-full w-full"
        width="100%"
        height="100%"
        {...otherProps}
      >
        <rect
          fill="none"
          width="100%"
          height="100%"
          rx={rx}
          ry={ry}
          ref={pathRef}
        />
      </svg>
      <motion.div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          display: "inline-block",
          transform,
        }}
      >
        {children}
      </motion.div>
    </>
  );
};
