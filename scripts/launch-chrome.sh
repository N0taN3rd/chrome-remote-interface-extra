#!/usr/bin/env bash

nohup google-chrome-unstable --force-color-profile=srgb \
  --remote-debugging-port=9222 \
  --disable-background-networking \
  --disable-background-timer-throttling \
  --disable-renderer-backgrounding \
  --disable-backgrounding-occluded-windows \
  --disable-ipc-flooding-protection \
  --enable-features=NetworkService,NetworkServiceInProcess \
  --disable-client-side-phishing-detection \
  --disable-default-apps \
  --disable-extensions \
  --disable-popup-blocking \
  --disable-hang-monitor \
  --disable-prompt-on-repost \
  --disable-sync \
  --disable-domain-reliability \
  --disable-infobars \
  --disable-features=site-per-process,TranslateUI,BlinkGenPropertyTrees \
  --disable-breakpad \
  --disable-backing-store-limit \
  --metrics-recording-only \
  --no-first-run \
  --safebrowsing-disable-auto-update \
  --mute-audio \
  --autoplay-policy=no-user-gesture-required \
  about:blank &>/dev/null &