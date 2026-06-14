FROM node:20-alpine

WORKDIR /app/desktop

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm install

# Copy rest of the files
COPY . .

EXPOSE 5173

# Expose host to allow access from outside the container
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
