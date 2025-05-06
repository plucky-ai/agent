FROM mcr.microsoft.com/vscode/devcontainers/javascript-node:22-bullseye

WORKDIR /workspace

ADD package.json /workspace
ADD package-lock.json /workspace

RUN npm install

ADD . /workspace