import {app} from 'electron';
import path from 'path';
import fs from 'fs';

const urlsStoragePath = path.join(app.getPath('userData'), 'urls.json');
const configPath = path.join(app.getPath('userData'), 'config.json');

function readJsonFromFile(filePath, fallback = {}) {
    try {
        return fs.existsSync(filePath)
            ? JSON.parse(fs.readFileSync(filePath, 'utf-8'))
            : fallback;
    } catch (e) {
        console.error('readJsonFromFile failed', filePath, e);
        return fallback;
    }
}

function writeJsonToFile(filePath, data) {
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (e) {
        console.error('writeJsonToFile failed', filePath, e);
    }
}

export function loadViewURLs() {
    return readJsonFromFile(urlsStoragePath, []);
}

export function saveViewURLs(urls) {
    writeJsonToFile(urlsStoragePath, urls);
}

export function loadAppConfig() {
    return readJsonFromFile(configPath, {});
}

export function saveAppConfig(config) {
    writeJsonToFile(configPath, config);
}