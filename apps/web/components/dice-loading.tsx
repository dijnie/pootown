"use client";

export function DiceLoading() {
  return (
    <div
      className="flex justify-center items-center flex-col font-bold text-center"
      style={{ perspective: "500px" }}
    >
      <div
        className="w-20 h-20 relative"
        style={{
          transformStyle: "preserve-3d",
          animation: "roll 2.5s linear infinite",
        }}
      >
        {/* Front face */}
        <div
          className="w-full h-full absolute box-border bg-white text-black leading-[80px] text-[40px]"
          style={{ transform: "translateZ(40px)" }}
        >
          1
        </div>

        {/* Back face */}
        <div
          className="w-full h-full absolute box-border bg-white text-black leading-[80px] text-[40px]"
          style={{ transform: "translateZ(-40px) rotateY(180deg)" }}
        >
          6
        </div>

        {/* Left face */}
        <div
          className="w-full h-full absolute box-border bg-white text-black leading-[80px] text-[40px] left-10"
          style={{ transform: "rotateY(90deg)" }}
        >
          2
        </div>

        {/* Right face */}
        <div
          className="w-full h-full absolute box-border bg-white text-black leading-[80px] text-[40px] right-10"
          style={{ transform: "rotateY(-90deg)" }}
        >
          5
        </div>

        {/* Top face */}
        <div
          className="w-full h-full absolute box-border bg-white text-black leading-[80px] text-[40px] top-10"
          style={{ transform: "rotateX(-90deg)" }}
        >
          3
        </div>

        {/* Bottom face */}
        <div
          className="w-full h-full absolute box-border bg-white text-black leading-[80px] text-[40px] bottom-10"
          style={{ transform: "rotateX(90deg)" }}
        >
          4
        </div>
      </div>

      <p
        className="mt-20 mx-auto text-black tracking-[0.5em] indent-[0.5em] text-lg"
        style={{ animation: "blink 1s ease-in-out infinite alternate" }}
      >
        LOADING...
      </p>
    </div>
  );
}
