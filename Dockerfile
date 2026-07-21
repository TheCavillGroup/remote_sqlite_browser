FROM denoland/deno:latest AS build
WORKDIR /app
COPY deno.json deno.lock ./
RUN deno install
COPY . .
RUN deno task build

FROM denoland/deno:latest
WORKDIR /app
COPY --from=build /app/dist ./dist
EXPOSE 8000
CMD ["deno", "x", "-A", "-y", "serve", "-l", "8000", "dist"]