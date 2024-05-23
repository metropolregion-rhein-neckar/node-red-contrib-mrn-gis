import { AbstractNode } from "node-red-typescript-essentials/AbstractNode";
import { NodeStatus } from "node-red-typescript-essentials/node_status";

import axios, { AxiosResponse } from "axios";
// Out: GeoJSON object as payload
import * as fxp from "fast-xml-parser";

module.exports = function (RED: any) {
  class FreifunkNodeConfig {
    constructor(public api_url: string, public bbox: string) {}
  }

  class FreifunkNode extends AbstractNode {
    constructor(public config: FreifunkNodeConfig) {
      super(config, RED);
      this.on("input", this.onInput);
    }

    async onInput(msg: any, send: any, done: any) {
      try {
        this.status(new NodeStatus("Requesting Data..."));
        
        let bbox: any = this.config.bbox.split(",");

        this.config.api_url +=
          "&minlat=" + bbox[0] + "&maxlat=" + bbox[1] + "&minlon=" + bbox[2] + "&maxlon=" + bbox[3];

        let res = (await axios.get(this.config.api_url, { "responseType": "document" })) as AxiosResponse;

        if (res == undefined) {
          throw "Download failed, response is undefined";
        }

        let geojson: any = {
          "type": "FeatureCollection",
          "features": [],
        };

        let options: any = {
          ignoreAttributes: false,
          attributeNamePrefix: "",
        };

        let parser = new fxp.XMLParser(options);
        let data: any = undefined;

        try {
          data = parser.parse(res.data);
        } catch {
          throw "freifunk-request: could not parse xml";
        }

        if (!("gpx" in data) || !("wpt" in data.gpx)) {
          throw "freifunk-request: xml tags changed";
        }

        let numSkip: number = 0;
        for (let station of data.gpx.wpt) {
          if (!("name" in station) || !("lon" in station) || !("lat" in station)) {
            numSkip += 1;
            continue;
          }

          let feature: any = {
            "type": "Feature",

            "properties": {
              name: station.name,
            },
            "geometry": {
              "type": "Point",
              "coordinates": [parseFloat(station["lon"]), parseFloat(station["lat"])],
            },
          };

          geojson.features.push(feature);
        }

        if (numSkip == data.gpx.wpt.length) {
          throw "freifunk-request: Response structure changed name and/or lat and or lon are no longer tags/attributes";
        }

        if (geojson.features.length == 0) {
          throw "freifunk-request: no features in geojson sensor values probably changed.";
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

  RED.nodes.registerType("freifunk", FreifunkNode);
};
