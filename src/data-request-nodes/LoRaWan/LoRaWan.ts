import { AbstractNode } from "node-red-typescript-essentials/AbstractNode";
import { NodeStatus } from "node-red-typescript-essentials/node_status";

import axios, { AxiosResponse } from "axios";

// Out: GeoJSON object as payload

module.exports = function (RED: any) {
  class LoRaWanConfigNode {
    constructor(public api_url: string, public center: string, public radius: string) {}
  }

  class LoRaWanNode extends AbstractNode {
    oldOutfile: string = "";

    constructor(public config: LoRaWanConfigNode) {
      super(config, RED);

      this.on("input", this.onInput);
    }

    async onInput(msg: any, send: any, done: any) {
      try {
        let center: any = this.config.center.split(",");

        let url: string =
          this.config.api_url +
          "latitude=" +
          center[1] +
          "&" +
          "longitude=" +
          center[0] +
          "&" +
          "distance=" +
          this.config.radius;

        this.status(new NodeStatus("Requesting Data..."));

        let res = (await axios.get(url)) as AxiosResponse;

        if (res == undefined) {
          throw "Download failed, response is undefined";
        }

        let geojson: any = {
          "type": "FeatureCollection",
          "features": [],
        };

        let data: any = res.data;
        let threeDaysAgo: any = new Date();
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

        if (data instanceof Array || data instanceof String) {
          throw "LoRaWan-request: Response structure changed, response is no longer an Array";
        }

        let activeStations: number = 0;
        let numSkips: number = 0;

        for (let station in data) {
          if (!("last_seen" in data[station])) {
            continue;
          }

          let last_seen: any = new Date(data[station].last_seen);

          // check if station was active within the last 3 days
          if (last_seen >= threeDaysAgo) {
            activeStations += 1;

            let keys: Array<string> = ["id", "description", "location", "attributes"];
            let availableKeys: Array<string> = [];
            for (let key of keys) {
              if (key in data[station]) {
                availableKeys.push(key);
              }
            }

            if (
              !("location" in data[station]) ||
              !("longitude" in data[station].location) ||
              !("latitude" in data[station].location)
            ) {
              numSkips += 1;
              continue;
            }

            let feature: any = {
              "type": "Feature",

              "properties": {
                last_seen: last_seen.toString(),
              },
              "geometry": {
                "type": "Point",
                "coordinates": [
                  parseFloat(data[station].location.longitude),
                  parseFloat(data[station].location.latitude),
                ],
              },
            };

            if ("attributes" in data[station] && "id" in data[station]) {
              feature.properties.id = data[station]["id"];
            }

            if ("attributes" in data[station] && "description" in data[station]) {
              feature.properties.id = data[station]["description"];
            }
            geojson.features.push(feature);
          }
        }

        if (numSkips == activeStations) {
          throw "LoRaWan-request: Response structure changed, location structure changed";
        }
        if (geojson.features.length == 0) {
          throw "LoRaWan-request: no features in geojson sensor values probably changed.";
        }

        msg.payload = JSON.parse(JSON.stringify(geojson));

        send(msg);

        let info: any = { fill: "green", shape: "dot", text: "GeoJSON successfully saved" };
        this.status(info);
        done();
      } catch (e) {
        done(e);
        console.log(e);
        let info: any = { fill: "red", shape: "dot", text: "Stopped because of error" };
        this.status(info);
      }
    }
  }

  RED.nodes.registerType("LoRaWan", LoRaWanNode);
};
