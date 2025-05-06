FROM mcr.microsoft.com/vscode/devcontainers/javascript-node:22-bullseye

WORKDIR /workspace

ADD package.json /workspace
ADD yarn.lock /workspace

RUN yarn install

ADD . /workspace