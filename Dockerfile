FROM node:8-alpine
LABEL Author="André Nishitani <andre.nishitani@sensedia.com>"

RUN mkdir /ws

WORKDIR /ws

RUN npm install request argparse

COPY sensedia-api-error-monitor.js /ws
COPY httpstatus.json /ws

ENTRYPOINT ["node", "sensedia-api-error-monitor.js"]

