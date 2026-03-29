#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

usage() {
  cat <<'EOF'
Usage:
  npm run release -- patch
  npm run release -- minor
  npm run release -- major
  npm run release -- 1.0.7

What it does:
  1. Bumps version in package.json/package-lock.json
  2. Runs TypeScript check
  3. Creates git commit from current changes
  4. Creates git tag v<version>
  5. Pushes current branch and tag to origin
EOF
}

if [[ $# -ne 1 ]]; then
  usage
  exit 1
fi

VERSION_ARG="$1"

if [[ "$VERSION_ARG" == "-h" || "$VERSION_ARG" == "--help" ]]; then
  usage
  exit 0
fi

if ! command -v git >/dev/null 2>&1; then
  echo "Error: git is not installed"
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "Error: npm is not installed"
  exit 1
fi

CURRENT_BRANCH="$(git branch --show-current)"
if [[ -z "$CURRENT_BRANCH" ]]; then
  echo "Error: unable to determine current git branch"
  exit 1
fi

CURRENT_VERSION="$(node -p "require('./package.json').version")"
echo "Current version: $CURRENT_VERSION"

echo "Bumping version using: $VERSION_ARG"
npm version "$VERSION_ARG" --no-git-tag-version

NEW_VERSION="$(node -p "require('./package.json').version")"
TAG="v$NEW_VERSION"

echo "New version: $NEW_VERSION"

echo "Running TypeScript check..."
npx tsc --noEmit

echo "Building application..."
npm run build

echo "Staging current changes..."
git add -A

if [[ -z "$(git status --porcelain)" ]]; then
  echo "Error: nothing to commit"
  exit 1
fi

if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "Error: git tag $TAG already exists locally"
  exit 1
fi

if git ls-remote --tags origin "$TAG" | grep -q "$TAG"; then
  echo "Error: git tag $TAG already exists on origin"
  exit 1
fi

echo "Creating commit and tag..."
git commit -m "release: $TAG"
git tag "$TAG"

echo "Pushing branch $CURRENT_BRANCH and tag $TAG to origin..."
git push origin "$CURRENT_BRANCH"
git push origin "$TAG"

echo "Done: release $TAG pushed successfully"
