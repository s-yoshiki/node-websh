
# init
export NODE_ENV=prod
# rm -r .cache

# frontend
cd client 
vite build
cd ../

# backend
esbuild ./server/main.ts \
 --platform=node \
 --minify \
 --format=cjs \
 --outfile=./dist/main.js
