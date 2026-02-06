#!/bin/bash
cd /home/kavia/workspace/code-generation/wikipedia-explorer-317323-317332/wikipedia_frontend
npm run build
EXIT_CODE=$?
if [ $EXIT_CODE -ne 0 ]; then
   exit 1
fi

