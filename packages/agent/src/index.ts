#!/usr/bin/env node
import { Effect } from "effect";
import { NodeRuntime, NodeServices } from "@effect/platform-node";

const program = Effect.gen(function* () {});

program.pipe(Effect.provide(NodeServices.layer), NodeRuntime.runMain);
