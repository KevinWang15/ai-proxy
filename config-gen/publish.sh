#!/bin/zsh

node gen.js > config.json
scp ./config.json root@47.92.23.19:/root/secretdocs/public/ai-config-1.json