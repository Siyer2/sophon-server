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

## To build: docker build -t api.thesophon.com .
## To run: docker run -p 5902:5902 api.thesophon.com
## Together: docker build -t api.thesophon.com . && docker run -p 5902:5902 api.thesophon.com