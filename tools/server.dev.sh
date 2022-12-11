
# init
export NODE_ENV=development
rm -r .cache

# frontend
cd client 
vite build
cd ../

# backend
esbuild ./server/main.ts \
 --platform=node \
 --minify \
 --format=cjs \
 --outfile=./.cache/dist/main.js

node ./.cache/dist/main.js