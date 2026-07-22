import { NodeRuntime } from "@effect/platform-node"
import { Layer } from "effect"
import { AssetsExplorerServer } from "./server-layer.js"

Layer.launch(AssetsExplorerServer).pipe(NodeRuntime.runMain)
