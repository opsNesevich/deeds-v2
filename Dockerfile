FROM node:20-slim

RUN apt-get update && apt-get install -y poppler-utils python3 python3-pip && rm -rf /var/lib/apt/lists/*
RUN pip3 install pypdf --break-system-packages

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

EXPOSE 8080
CMD ["npm", "start"]
