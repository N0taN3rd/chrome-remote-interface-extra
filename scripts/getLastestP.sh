#!/usr/bin/env bash

if [[ ${PWD} == *chrome-remote-interface-extra ]]; then
    if [[ ! -d ./puppeteer-master ]]; then
        git clone https://github.com/GoogleChrome/puppeteer.git puppeteer-master
     else
        echo pulling latest master
        cd puppeteer-master
        git fetch --all
        git pull
        cd ..
     fi
else
    echo "${PWD} is not the directory you are looking for"
fi
