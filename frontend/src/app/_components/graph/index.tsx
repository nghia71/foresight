"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import L from "leaflet";

import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";

import { Geo, NodeFilter, Ogma } from "@linkurious/ogma-react";
import OgmaLib, { type RawNode } from "@linkurious/ogma";

import {
  faCaretLeft,
  faCaretRight,
  faCircleNodes,
  faCompress,
  faExpand,
  faMap,
  faMinimize,
  faSitemap,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import "leaflet/dist/leaflet.css";
import { useResizeObserver } from "usehooks-ts";
import { useParams } from "next/navigation";
import useDebounceCallback from "~/app/_hooks/useDebouncedCallback";
import { useStore } from "~/app/_store";
import { type AllDataTypes } from "~/server/api/routers/post";
import ThreatSelector from "~/app/_components/ThreatSelector";
import { getNodeData, isNodeFiltered } from "~/app/_utils/graph";
import LayoutService, { type LayoutServiceRef } from "./Layout";

import DataLoader from "./DataLoader";
import NodeInfo from "./NodeInfo";
import TimeLine from "./TimeLine";

// const colors = d3.scaleOrdinal(d3.schemeCategory10);

OgmaLib.libraries.leaflet = L;

// function hexToRgbA(hex: string, opacity = 1) {
//   let c: string[] | string;
//   if (/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)) {
//     c = hex.substring(1).split("");
//     if (c.length == 3) {
//       c = [
//         c[0] ?? "0",
//         c[0] ?? "0",
//         c[1] ?? "0",
//         c[1] ?? "0",
//         c[2] ?? "0",
//         c[2] ?? "0",
//       ];
//     }
//     const h = Number("0x" + c.join(""));

//     return (
//       "rgba(" +
//       [(h >> 16) & 255, (h >> 8) & 255, h & 255].join(",") +
//       `,${opacity})`
//     );
//   }
//   throw new Error("Bad Hex");
// }

export function getRawNodeData(node: RawNode) {
  const n = node as RawNode<AllDataTypes>;
  const data = n.data;
  return data;
}

export interface Country {
  country: string;
  latitude: string;
  longitude: string;
  name: string;
}

export default function Graph() {
  const ref = useRef<HTMLDivElement | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const ogmaRef = useRef<OgmaLib | null>(null);
  const ogmaHoverRef = useRef<OgmaLib | null>(null);
  const ogmaHoverContainerRef = useRef<HTMLDivElement | null>(null);
  const layoutService = useRef<LayoutServiceRef | null>(null);
  const { height, width } = useResizeObserver({ ref, box: "border-box" });
  const { day } = useParams();
  const [dataLoading, setDataLoading] = useState(false);

  const {
    showInfoPanel,
    setShowInfoPanel,
    toggleTreeDirection,
    setPanelWasToggled,
    layout,
    setLayout,
    geoMode,
    setGeoMode,
    threats,
    clusterId,
    setFocus,
  } = useStore();

  const handleDataLoading = useCallback((loading: boolean) => {
    setDataLoading(loading);
  }, []);

  const handleLayoutForceClick = useCallback(() => {
    setLayout("force");
    setFocus(null);
  }, [setFocus, setLayout]);

  const handleLayoutHierarchicalClick = useCallback(() => {
    if (layout === "hierarchical") toggleTreeDirection();
    setLayout("hierarchical");
    setFocus(null);
  }, [layout, setFocus, setLayout, toggleTreeDirection]);

  // Controls
  const [maximized, setMaximized] = useState(false);

  const handleGeoBtnClick = useCallback(() => {
    setGeoMode(!geoMode);
  }, [geoMode, setGeoMode]);

  const handleCollapseAllClick = useCallback(() => {
    if (!ogmaRef.current) return;
    void ogmaRef.current.removeNodes(
      ogmaRef.current
        .getNodes()
        .filter((n) =>
          ["article"].includes(getNodeData(n)?.type ?? ""),
        ),
    );
  }, []);

  const handleMaximizeClick = useCallback(() => {
    setMaximized(!maximized);
  }, [maximized]);

  const resizeOgma = useDebounceCallback(
    (ogma: OgmaLib, max: boolean, w: number, h: number) => {
      const currentSize = ogma.view.getSize();
      if (
        max &&
        (currentSize.height !== window.innerHeight ||
          currentSize.width !== window.innerWidth)
      ) {
        void ogma.view.setSize({
          width: window.innerWidth,
          height: window.innerHeight,
        });
      } else if (currentSize.width !== w || currentSize.height !== h) {
        const resize = async () => {
          await ogma.view.setSize({ width: w, height: h });
          if (ogma.geo.enabled()) {
            const view = ogma.geo.getView();
            await ogma.geo.disable({ duration: 0 });
            await ogma.geo.enable({ duration: 0 });
            if (view)
              await ogma.geo.setView(view.latitude, view.longitude, view.zoom);
          } else {
            await ogma.view.locateGraph();
          }
        };
        void resize();
      }
    },
  );

  useEffect(() => {
    if (ogmaRef.current && ogmaHoverContainerRef.current) {
      console.log(" --- append child container thing ---");
      ogmaRef.current.geo
        .getMap()
        ?.getContainer()
        .appendChild(ogmaHoverContainerRef.current);
    }
  }, [geoMode]);

  useEffect(() => {
    if (!ogmaRef.current) return;
    if (maximized) {
      resizeOgma(ogmaRef.current, true, window.innerWidth, window.innerHeight);
    } else if (width && height) {
      resizeOgma(ogmaRef.current, false, width, height);
    }
  }, [height, width, maximized, resizeOgma]);

  const handleNodeViewToggle = useCallback(() => {
    if (showInfoPanel) setPanelWasToggled(true);
    setShowInfoPanel(!showInfoPanel);
  }, [setPanelWasToggled, setShowInfoPanel, showInfoPanel]);

  if (typeof day !== "string") return "Day error";

  return (
    <PanelGroup autoSaveId="example" direction="horizontal">
      <Panel
        defaultSize={25}
        minSize={25}
        
        className={`${showInfoPanel ? "flex" : "hidden"} border`}
      >
        <button
          className="btn btn-default absolute -left-8"
          onClick={handleNodeViewToggle}
        >
          <FontAwesomeIcon icon={faCaretLeft} />
        </button>
        <NodeInfo />
      </Panel>
      <PanelResizeHandle />
      <Panel className="flex flex-col border">
        {!showInfoPanel && (
          <button
            className="btn btn-default absolute -left-8"
            onClick={handleNodeViewToggle}
          >
            <FontAwesomeIcon icon={faCaretRight} />
          </button>
        )}
        <div className="relative w-full flex-1" ref={ref}>
          <ThreatSelector />
          <div className="absolute h-full max-h-full w-full max-w-full">
            <Ogma
              // key={`ogma-${day}-${history}`}
              ref={ogmaRef}
              options={
                {
                  // width,
                  // height,
                  // detect: {
                  //   edges: false,
                  //   nodeTexts: false,
                  //   edgeTexts: false,
                  // },
                  // interactions: {
                  //   drag: {
                  //     enabled: false,
                  //   },
                  // },
                }
              }
              onReady={(ogma) => {
                ogma.events
                  .on("mouseover", ({ target }) => {
                    if (
                      !target ||
                      !target.isNode ||
                      !target.isVirtual() ||
                      !ogmaHoverContainerRef.current ||
                      !ogmaHoverRef.current
                    )
                      return;
                    const subNodes = target.getSubNodes()!;
                    const subEdges = subNodes.getAdjacentEdges({
                      filter: "all",
                      bothExtremities: true,
                    });
                    ogmaHoverContainerRef.current.classList.remove("hidden");
                    void ogmaHoverRef.current.setGraph({
                      nodes: subNodes.toJSON(),
                      edges: subEdges.toJSON(),
                    });
                    const { x, y } = target.getPositionOnScreen();
                    ogmaHoverContainerRef.current.style.left = `${x + 50}px`;
                    ogmaHoverContainerRef.current.style.top = `${y}px`;
                  })
                  .on(["click", "dragStart", "viewChanged"], () => {
                    ogmaHoverContainerRef.current?.classList.add("hidden");
                  });
              }}
            >
              <DataLoader day={parseInt(day)} onLoading={handleDataLoading} />

              <NodeFilter
                enabled
                criteria={(n) => !isNodeFiltered(n, threats)}
              />
              <LayoutService
                ref={layoutService}
                threats={threats}
                dataLoaded={dataLoading}
                fullScreen={maximized}
                onExitFullScreen={handleMaximizeClick}
              />
              {clusterId && <TimeLine container={timelineRef} />}
              <Geo
                enabled={geoMode}
                longitudePath="location.longitude"
                latitudePath="location.latitude"
                minZoomLevel={2}
                maxZoomLevel={10}
                sizeRatio={0.8}
                duration={0}
              />
              <>
                <div className="control-buttons space-x-2">
                  {!geoMode && (
                    <>
                      <div className="btn-group">
                        <button
                          className={`btn btn-primary${layout === "hierarchical" ? " active" : ""}`}
                          onClick={handleLayoutHierarchicalClick}
                          title="Hierarchical Layout"
                        >
                          <span className="wb-inv">
                            Layout nodes using a hierarchical algorithm
                          </span>
                          <FontAwesomeIcon icon={faSitemap} />
                        </button>
                        <button
                          className={`btn btn-primary${layout === "force" ? " active" : ""}`}
                          onClick={handleLayoutForceClick}
                          title="Force Layout"
                        >
                          <span className="wb-inv">
                            Layout nodes using a force layout
                          </span>
                          <FontAwesomeIcon icon={faCircleNodes} />
                        </button>
                      </div>
                      <button
                        className="btn btn-primary"
                        onClick={handleCollapseAllClick}
                        title="Remove articles and threats"
                      >
                        <FontAwesomeIcon icon={faCompress} />
                      </button>
                    </>
                  )}
                  <button
                    className="btn btn-primary"
                    onClick={handleGeoBtnClick}
                    title="Map view"
                  >
                    <span className="wb-inv">View clusters on a map</span>
                    <FontAwesomeIcon icon={faMap} />
                  </button>

                  <button
                    className="btn btn-primary"
                    onClick={handleMaximizeClick}
                    title="Fullscreen"
                  >
                    <span className="wb-inv">Switch to Full Screen View</span>
                    <FontAwesomeIcon icon={maximized ? faMinimize : faExpand} />
                  </button>
                </div>
              </>
            </Ogma>
            <div ref={ogmaHoverContainerRef} className="hoverogma hidden">
              <Ogma
                ref={ogmaHoverRef}
                options={{
                  width: 150,
                  height: 150,
                  backgroundColor: "rgba(250,250,250,0.75)",
                }}
              >
                <LayoutService
                  threats={threats}
                  dataLoaded={dataLoading}
                  fullScreen={false}
                  hover={true}
                />
              </Ogma>
            </div>
            {clusterId && (
              <div className="" id="timeline" ref={timelineRef}></div>
            )}
          </div>
        </div>
        {/* <div className="h-[256px]"></div> */}
      </Panel>
    </PanelGroup>
  );
}
