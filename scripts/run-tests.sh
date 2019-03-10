#!/usr/bin/env bash

node --harmony-await-optimization /node_modules/.bin/ava --timeout=45s -c 1 -v -s ./test