#!/usr/bin/env bash
#
# Composes the YouTube thumbnail: the generated artwork plus the title,
# overlaid here rather than rendered by the image model.
#
# Text is drawn in code on purpose. Image models garble lettering, and a
# misspelt "Complaint Concierge" or "AFCA" on something sent to a recruiter at
# AFCA would be the worst possible typo. Drawing it with ffmpeg means it is
# sharp, correctly spelled, in the exact brand colours, and the wording can be
# changed without spending another generation.
#
#   ./thumbnail.sh [source-image] [output]
#
set -euo pipefail
cd "$(dirname "$0")"

SRC="${1:-public/thumbnail/artwork.png}"
OUT="${2:-public/thumbnail/thumbnail.jpg}"

TITLE="Complaint Concierge"
TAGLINE="Just talk. The form fills itself in."

BOLD=/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf
REGULAR=/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf

YELLOW=0xFFD200
WHITE=0xFFFFFF

mkdir -p "$(dirname "$OUT")"

# Layout: artwork full bleed, text in a band across the bottom.
#
# Earlier attempts put the text in a left-hand column, but this artwork is
# composed centre-frame: the title ran across the speech bubble, and cropping
# to make room sliced the bubble in half. A bottom band works with whatever the
# generator produces, and matches how the video's own captions sit.
#
# The band is drawn as a semi-opaque navy rectangle so the text keeps its
# contrast wherever the art is light underneath.
ffmpeg -v error -i "$SRC" -filter_complex "
  [0:v]scale=1280:720:flags=lanczos,
       drawbox=x=0:y=500:w=1280:h=220:color=0x002850@0.93:t=fill,
       drawbox=x=0:y=500:w=1280:h=5:color=${YELLOW}@1.0:t=fill,
       drawtext=fontfile=${BOLD}:text='${TITLE}':fontcolor=${WHITE}:fontsize=62:x=64:y=545,
       drawtext=fontfile=${REGULAR}:text='${TAGLINE}':fontcolor=${YELLOW}:fontsize=32:x=66:y=630
" -frames:v 1 -q:v 2 -y "$OUT"

printf 'wrote %s (%s)\n' "$OUT" "$(ffprobe -v error -show_entries stream=width,height -of csv=p=0 "$OUT")"
