import React from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { FPS, OUTRO_SECONDS, SCENES, TITLE_SECONDS, type Scene } from "./scenes";

const NAVY = "#002850";
const INK = "#0b1b33";
const YELLOW = "#ffd200";
const PAPER = "#f4f6fa";

const FONT =
  "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

/** Fade in and out at the edges of a sequence, so cuts never hard-flash. */
function useFade(durationInFrames: number, fade = 14): number {
  const frame = useCurrentFrame();
  return Math.min(
    interpolate(frame, [0, fade], [0, 1], { extrapolateRight: "clamp" }),
    interpolate(frame, [durationInFrames - fade, durationInFrames], [1, 0], {
      extrapolateLeft: "clamp",
    }),
  );
}

/**
 * One beat: the screenshot with a slow push toward its focal point, and a
 * caption bar carrying the "why" for that step.
 */
const Beat: React.FC<{ scene: Scene; durationInFrames: number; index: number }> = ({
  scene,
  durationInFrames,
  index,
}) => {
  const frame = useCurrentFrame();
  const opacity = useFade(durationInFrames);

  // A slow Ken Burns push. Small numbers on purpose: the screenshots carry
  // fine UI text and anything faster reads as drift.
  const progress = interpolate(frame, [0, durationInFrames], [0, 1], {
    extrapolateRight: "clamp",
  });
  const scale = 1.01 + progress * 0.03;
  const [fx, fy] = scene.focus ?? [0.5, 0.5];
  // Damped so the push suggests a focal point without cropping the chrome away.
  const shiftX = (0.5 - fx) * (scale - 1) * 55;
  const shiftY = (0.5 - fy) * (scale - 1) * 55;

  const captionIn = spring({ frame: frame - 6, fps: FPS, config: { damping: 200 } });

  return (
    <AbsoluteFill style={{ backgroundColor: INK, opacity }}>
      {/* A short beat of silence before Jess starts, so the cut lands first. */}
      <Sequence from={Math.round(0.45 * FPS)}>
        <Audio src={staticFile(`voice/${scene.voice}.mp3`)} />
      </Sequence>

      <AbsoluteFill
        style={{
          transform: `scale(${scale}) translate(${shiftX}%, ${shiftY}%)`,
        }}
      >
        {/* contain, not cover: the shots are already 16:9, and cropping would
            cut the header and the form column that the captions refer to. */}
        <Img
          src={staticFile(`shots/${scene.shot}`)}
          style={{ width: "100%", height: "100%", objectFit: "contain" }}
        />
      </AbsoluteFill>

      {/* The app UI is light and busy, so the lower third needs to go
          essentially opaque for 30px caption text to stay readable. */}
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(to top, rgba(4,12,26,0.99) 0%, rgba(4,12,26,0.98) 28%, rgba(4,12,26,0.88) 40%, rgba(4,12,26,0.35) 52%, rgba(4,12,26,0) 62%)",
        }}
      />

      <AbsoluteFill
        style={{
          justifyContent: "flex-end",
          padding: "0 110px 82px",
          opacity: captionIn,
          transform: `translateY(${(1 - captionIn) * 26}px)`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 20 }}>
          <div
            style={{
              width: 46,
              height: 6,
              borderRadius: 3,
              backgroundColor: YELLOW,
            }}
          />
          <div
            style={{
              fontFamily: FONT,
              fontSize: 21,
              fontWeight: 700,
              letterSpacing: 2.6,
              textTransform: "uppercase",
              color: YELLOW,
            }}
          >
            {String(index + 1).padStart(2, "0")}
          </div>
        </div>
        <div
          style={{
            fontFamily: FONT,
            fontSize: 62,
            fontWeight: 800,
            letterSpacing: -1.4,
            lineHeight: 1.1,
            color: "#ffffff",
            maxWidth: 1500,
          }}
        >
          {scene.title}
        </div>
        <div
          style={{
            fontFamily: FONT,
            fontSize: 30,
            fontWeight: 400,
            lineHeight: 1.45,
            color: "rgba(255,255,255,0.86)",
            maxWidth: 1380,
            marginTop: 20,
          }}
        >
          {scene.body}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/** Opening card. */
const Title: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => {
  const frame = useCurrentFrame();
  const opacity = useFade(durationInFrames, 18);
  const rise = spring({ frame, fps: FPS, config: { damping: 200 } });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: NAVY,
        justifyContent: "center",
        alignItems: "center",
        opacity,
      }}
    >
      <Sequence from={Math.round(0.8 * FPS)}>
        <Audio src={staticFile("voice/title.mp3")} />
      </Sequence>
      <div
        style={{
          transform: `translateY(${(1 - rise) * 30}px)`,
          opacity: rise,
          textAlign: "center",
          padding: "0 120px",
        }}
      >
        <div
          style={{
            fontFamily: FONT,
            fontSize: 24,
            fontWeight: 700,
            letterSpacing: 4.5,
            textTransform: "uppercase",
            color: YELLOW,
            marginBottom: 34,
          }}
        >
          A chat that fills in a form
        </div>
        <div
          style={{
            fontFamily: FONT,
            fontSize: 106,
            fontWeight: 800,
            letterSpacing: -3,
            color: "#ffffff",
            lineHeight: 1.04,
          }}
        >
          Complaint Concierge
        </div>
        <div
          style={{
            fontFamily: FONT,
            fontSize: 34,
            fontWeight: 400,
            color: "rgba(255,255,255,0.8)",
            marginTop: 30,
            lineHeight: 1.4,
          }}
        >
          The complaint form is the schema. The conversation is the interface.
        </div>
      </div>
    </AbsoluteFill>
  );
};

/** Closing card: the point of the whole demo. */
const Outro: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => {
  const frame = useCurrentFrame();
  const opacity = useFade(durationInFrames, 18);
  const rise = spring({ frame, fps: FPS, config: { damping: 200 } });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: NAVY,
        justifyContent: "center",
        alignItems: "center",
        opacity,
      }}
    >
      <Sequence from={Math.round(0.6 * FPS)}>
        <Audio src={staticFile("voice/outro.mp3")} />
      </Sequence>
      <div
        style={{
          transform: `translateY(${(1 - rise) * 26}px)`,
          opacity: rise,
          textAlign: "center",
          padding: "0 160px",
        }}
      >
        <div
          style={{
            fontFamily: FONT,
            fontSize: 66,
            fontWeight: 800,
            letterSpacing: -1.8,
            color: "#ffffff",
            lineHeight: 1.14,
          }}
        >
          The model never owns the state.
        </div>
        <div
          style={{
            fontFamily: FONT,
            fontSize: 31,
            fontWeight: 400,
            color: "rgba(255,255,255,0.82)",
            marginTop: 28,
            lineHeight: 1.5,
            maxWidth: 1250,
            marginLeft: "auto",
            marginRight: "auto",
          }}
        >
          It proposes a patch. Code validates it and decides what to ask next.
        </div>
        <div
          style={{
            marginTop: 46,
            display: "inline-block",
            padding: "15px 34px",
            borderRadius: 999,
            backgroundColor: YELLOW,
            fontFamily: FONT,
            fontSize: 25,
            fontWeight: 700,
            color: INK,
          }}
        >
          complaint-requirements.vercel.app
        </div>
        <div
          style={{
            fontFamily: FONT,
            fontSize: 19,
            color: "rgba(255,255,255,0.52)",
            marginTop: 34,
          }}
        >
          Demonstration only — not affiliated with AFCA. Demo data throughout.
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const Explainer: React.FC = () => {
  const { durationInFrames } = useVideoConfig();
  const titleFrames = Math.round(TITLE_SECONDS * FPS);
  const outroFrames = Math.round(OUTRO_SECONDS * FPS);

  let cursor = titleFrames;

  return (
    <AbsoluteFill style={{ backgroundColor: INK }}>
      <Sequence durationInFrames={titleFrames}>
        <Title durationInFrames={titleFrames} />
      </Sequence>

      {SCENES.map((scene, index) => {
        const frames = Math.round(scene.seconds * FPS);
        const from = cursor;
        cursor += frames;
        return (
          <Sequence key={scene.shot} from={from} durationInFrames={frames}>
            <Beat scene={scene} durationInFrames={frames} index={index} />
          </Sequence>
        );
      })}

      <Sequence from={durationInFrames - outroFrames} durationInFrames={outroFrames}>
        <Outro durationInFrames={outroFrames} />
      </Sequence>
    </AbsoluteFill>
  );
};
