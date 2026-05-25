# Unified SmartQueue frontend (TanStack Start). Serves every view as a route
# (/, /staff, /display, /notifications, /system, ...) on port 5173.
# Runs the Vite dev server so VITE_* env vars are read at runtime from the
# container environment (Vite inlines build-time env, so dev mode is what lets
# docker-compose override VITE_API_BASE without a rebuild).
FROM oven/bun:1

WORKDIR /app

# Install deps against the committed lockfile. node_modules is excluded via
# .dockerignore so bun resolves Linux-native binaries (esbuild, lightningcss,
# @tailwindcss/oxide) instead of inheriting the host's macOS builds.
COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile

COPY . .

EXPOSE 5173

# --host binds 0.0.0.0 so the published port is reachable from the host browser.
CMD ["bun", "run", "dev", "--", "--host", "--port", "5173"]
