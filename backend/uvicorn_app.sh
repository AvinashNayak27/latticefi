#!/bin/sh
export PYTHONPATH=$(pwd)
uvicorn src.index:app --host 0.0.0.0 --port 8000 --reload


