export default function LoadingSpinner() {
  return (
    <div className="relative w-40 h-40">
      {/* Track */}
      <div className="absolute inset-0 rounded-full border-[0.75em] border-white/20 shadow-[0_0_0_0.1em_rgba(255,255,255,0.1)_inset]" />
      
      {/* Track cover - creates the rotating cover effect */}
      <div className="absolute inset-0 rounded-full animate-[trackCover_4s_linear_infinite] origin-center">
        <div className="absolute top-[-0.1em] left-1/2 -translate-x-1/2 w-[7.5em] h-[2em] bg-background rounded-b-full" />
      </div>
      
      {/* Ball */}
      <div className="absolute inset-0 animate-[ball_4s_linear_infinite] origin-center">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1.5em] h-[1.5em] mt-[-0.75em] rounded-full bg-gradient-to-b from-orange-400 to-orange-600 shadow-[0_0_0.25em_rgba(0,0,0,0.5)] overflow-hidden">
          {/* Inner shadow */}
          <div className="absolute inset-[-25%] animate-[ballInnerShadow_4s_linear_infinite] origin-center">
            <div className="absolute inset-0 rounded-full shadow-[0_-0.5em_0.5em_rgba(0,0,0,0.3)_inset]" />
          </div>
          {/* Outer shadow */}
          <div className="absolute inset-[-25%] animate-[ballOuterShadow_4s_linear_infinite] origin-center">
            <div className="absolute inset-0 rounded-full shadow-[0.35em_0.35em_0.25em_rgba(0,0,0,0.3)]" />
          </div>
          {/* Texture */}
          <div className="absolute inset-[-25%] overflow-hidden rounded-full animate-[ballTexture_4s_linear_infinite]">
            <div className="absolute top-1/2 left-0 w-[200%] h-[0.1em] -translate-y-1/2 bg-gradient-to-r from-transparent via-orange-700/50 to-transparent" />
          </div>
        </div>
      </div>
    </div>
  );
}
