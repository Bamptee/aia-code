#!/usr/bin/env node

import 'dotenv/config';
import { createCli } from '../src/cli.js';

const program = createCli();
program.parse(process.argv);
