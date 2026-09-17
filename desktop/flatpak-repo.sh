#!/usr/bin/env bash
# Builds the Flatpak repository the site serves under /flatpak/: the newest GitHub release's bundle, imported into
# a fresh OSTree repository and signed, with the .flatpakrepo and .flatpakref files that let Discover, or one
# flatpak command, add the repository and install the game. Updates then arrive like any other Flatpak's.
#
# Needs flatpak, ostree, gpg and gh; FLATPAK_GPG_KEY (the armoured private key) and FLATPAK_GPG_KEY_ID; GH_TOKEN;
# and SITE, the site's address without a trailing slash. Usage: flatpak-repo.sh <output directory>
set -euo pipefail
out=${1:?usage: flatpak-repo.sh <output directory>}
: "${FLATPAK_GPG_KEY:?}" "${FLATPAK_GPG_KEY_ID:?}" "${SITE:?}"
repo=${GITHUB_REPOSITORY:-synthwave-pixel/ultima3}
work=$(mktemp -d)

gpg --batch --quiet --import <<<"$FLATPAK_GPG_KEY"
gh release download --repo "$repo" --pattern '*.flatpak' --dir "$work/bundle"
bundle=$(find "$work/bundle" -name '*.flatpak' | head -1)
[ -n "$bundle" ] || { echo "the latest release has no .flatpak bundle" >&2; exit 1; }

ostree init --repo="$work/repo" --mode=archive-z2
flatpak build-import-bundle --gpg-sign="$FLATPAK_GPG_KEY_ID" "$work/repo" "$bundle"
flatpak build-update-repo --gpg-sign="$FLATPAK_GPG_KEY_ID" --generate-static-deltas --prune --title="Ultima III" "$work/repo"

ref=$(ostree refs --repo="$work/repo" | grep '^app/' | head -1) # app/<id>/<arch>/<branch>
id=$(echo "$ref" | cut -d/ -f2)
branch=$(echo "$ref" | cut -d/ -f4)
key=$(gpg --export "$FLATPAK_GPG_KEY_ID" | base64 -w0)

mkdir -p "$out"
cp -R "$work/repo/." "$out/"
cat >"$out/ultima3.flatpakrepo" <<EOF
[Flatpak Repo]
Title=Ultima III
Url=$SITE/flatpak/
Homepage=$SITE/
Comment=Ultima III: Exodus
Description=LairWare's Macintosh port of Ultima III, rewritten for the browser and packaged for the desktop.
GPGKey=$key
EOF
cat >"$out/ultima3.flatpakref" <<EOF
[Flatpak Ref]
Title=Ultima III
Name=$id
Branch=$branch
Url=$SITE/flatpak/
SuggestRemoteName=ultima3
Homepage=$SITE/
IsRuntime=false
RuntimeRepo=https://dl.flathub.org/repo/flathub.flatpakrepo
GPGKey=$key
EOF
echo "flatpak repository: $ref from $(basename "$bundle") in $out"
