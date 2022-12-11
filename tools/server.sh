
# init
export NODE_ENV=prod
# rm -r .cache

# frontend
cd front 
vite build
cd ../

# backend
esbuild ./server/server.ts \
 --platform=node \
 --minify \
 --format=cjs \
 --outfile=./dist/server.js
