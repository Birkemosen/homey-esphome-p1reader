#!/usr/bin/env node
import { execSync } from 'child_process';
import { mkdir, rm } from 'fs/promises';
import { join } from 'path';

const ESPHOME_REPO = 'https://github.com/esphome/esphome.git';
const TEMP_DIR = join(process.cwd(), 'temp-esphome');
const PROTO_DIR = join(process.cwd(), 'proto');
const GENERATED_DIR = join(process.cwd(), 'lib/esphome-ts/api/protobuf');

async function main() {
  try {
    // Clean up previous runs
    await rm(TEMP_DIR, { recursive: true, force: true });
    await mkdir(TEMP_DIR, { recursive: true });
    await rm(PROTO_DIR, { recursive: true, force: true });
    await mkdir(PROTO_DIR, { recursive: true });
    await rm(GENERATED_DIR, { recursive: true, force: true });
    await mkdir(GENERATED_DIR, { recursive: true });

    // Clone ESPHome repo
    console.log('Cloning ESPHome repository...');
    execSync(`git clone --depth 1 ${ESPHOME_REPO} ${TEMP_DIR}`);

    // Copy only proto files
    console.log('Copying proto files...');
    execSync(`find ${join(TEMP_DIR, 'esphome/components/api')} -name "*.proto" -exec cp {} ${PROTO_DIR}/ \\;`);

    // Generate TypeScript types
    console.log('Generating TypeScript types...');
    const protoFiles = execSync(`find ${PROTO_DIR} -name "*.proto"`).toString().trim().split('\n');

    for (const protoFile of protoFiles) {
      const fileName = protoFile.split('/').pop();

      // Copy the source proto file to GENERATED_DIR
      execSync(`cp ${protoFile} ${GENERATED_DIR}/${fileName}`);

      // Generate TypeScript types
      execSync(`protoc --plugin=./node_modules/.bin/protoc-gen-es \
        --proto_path=${PROTO_DIR} \
        --es_out=${GENERATED_DIR} \
        --es_opt=target=ts,import_extension=.ts \
        ${protoFile}`);
    }

    console.log('Done!');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    // Clean up
    await rm(TEMP_DIR, { recursive: true, force: true });
  }
}

main(); 