# Ticket 001: Build script

Create build.sh with flags -O3 --bind -s ALLOW_MEMORY_GROWTH=1 -s EXPORT_ES6=1

> As built: `--bind` was dropped in favour of `EMSCRIPTEN_KEEPALIVE` plus
> `ccall`/`cwrap`. See spec.md "Decisions taken during implementation".
