import http from "k6/http";
import { check } from "k6";
import { sleep } from "k6";
import { Rate } from "k6/metrics";

export let errorRate = new Rate("errors");

export function setup() {
    return +Date.now() + +`${__ENV.DURATION}`*1000
}

export default function(data) {
    while (Date.now() < data) {
        var err = 0;
        const namespace = `${__ENV.NAMESPACE}`;
        const bootnodes = `${__ENV.BOOTNODES}`;
        const nodes = `${__ENV.NODES}`;
        const totalNodes = +bootnodes + +nodes;
        const totalPeers = +totalNodes - 1;
        
        var overlays = [];
        var overlaysPerNode = {};

        for (var i = 0; i < bootnodes; i++) {
            var res = http.get(`http://bee-bootnode-${i}-debug.${namespace}.core.internal/addresses`);
            if (res.status === 200) {
                var overlay = res.json().overlay;
                overlays.push(overlay);
                overlaysPerNode[`bootnode${i}`] = overlay;
            }
        }
        for (var i = 0; i < nodes; i++) {
            var res = http.get(`http://bee-${i}-debug.${namespace}.core.internal/addresses`);
            if (res.status === 200) {
                var overlay = res.json().overlay;
                overlays.push(overlay);
                overlaysPerNode[`node${i}`] = overlay;
            }
        }

        check(overlays, {
            "all nodes are up": o => o.length === totalNodes
        }) || errorRate.add(1) && err++;;

        var peersPerNode = {};

        for (var i = 0; i < bootnodes; i++) {
            var res = http.get(`http://bee-bootnode-${i}-debug.${namespace}.core.internal/peers`);
            if (res.status === 200) {
                var peers = res.json().peers;
                peersPerNode[`bootnode${i}`] = [];
                peers.forEach(peer => {
                    peersPerNode[`bootnode${i}`].push(peer.address);
                });
                check(peersPerNode[`bootnode${i}`], {
                    "all peers are added for bootnodes": p => p.length === totalPeers
                }) || errorRate.add(1) && err++;
            }
        }

        for (var i = 0; i < nodes; i++) {
            var res = http.get(`http://bee-${i}-debug.${namespace}.core.internal/peers`);
            if (res.status === 200) {
                var peers = res.json().peers;
                peersPerNode[`node${i}`] = [];
                peers.forEach(peer => {
                    peersPerNode[`node${i}`].push(peer.address);
                });
                check(peersPerNode[`node${i}`], {
                    "all peers are added for nodes": p => p.length === totalPeers
                }) || errorRate.add(1) && err++;
            } else { errorRate.add(1) && err++; }
        }

        for (var i = 0; i < bootnodes; i++) {
            var nodeOverlay = overlaysPerNode[`bootnode${i}`]
            overlays.forEach(overlay => {
                if (overlay === nodeOverlay) {
                    return;
                }
                if (peersPerNode[`bootnode${i}`] != undefined) {
                    check(peersPerNode[`bootnode${i}`], {
                        "all peers are connected with bootnode": p => p.includes(overlay)
                    }) || errorRate.add(1) && err++;
                } else { errorRate.add(1) && err++; }
            });
        }

        for (var i = 0; i < nodes; i++) {
            var nodeOverlay = overlaysPerNode[`node${i}`]
            overlays.forEach(overlay => {
                if (overlay === nodeOverlay) {
                    return;
                }
                if (peersPerNode[`node${i}`] != undefined) {
                    check(peersPerNode[`node${i}`], {
                        "all peers are connected with node": p => p.includes(overlay)
                    }) || errorRate.add(1) && err++;
                } else { errorRate.add(1) && err++; }
            });
        }

        if (err === 0) {
            break;
        }

        sleep(1);
    }
}