import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { createApp } from './app';

const port = Number(process.env.PORT ?? 3001);
const app = createApp();

// В production-режиме раздаём собранный клиент (dist/client)
const clientDir = path.resolve(process.cwd(), 'dist', 'client');
if (fs.existsSync(path.join(clientDir, 'index.html'))) {
  app.use(express.static(clientDir));
  app.get(/^\/(?!api\/).*/, (_req, res) => {
    res.sendFile(path.join(clientDir, 'index.html'));
  });
}

app.listen(port, () => {
  console.log(`server listening on http://localhost:${port}`);
});