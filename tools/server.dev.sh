
# init
export NODE_ENV=development
rm -r .cache

# frontend
cd front 
vite build
cd ../

# backend
esbuild ./server/server.ts \
 --platform=node \
 --minify \
 --format=cjs \
 --outfile=./.cache/dist/server.js

node ./.cache/dist/server.js