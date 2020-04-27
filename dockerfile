FROM node:alpine

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)
COPY package*.json ./

RUN apk add --no-cache --virtual deps \
    python \
    build-base \
    && npm install \
    && apk del deps

# Bundle app source
COPY . .

EXPOSE 5902

ENV DEPLOYMENT=production
CMD [ "node", "index.js" ]

## To build: docker build -t sophon-server .
## To run: docker run -it -p 80:5902 sophon-server