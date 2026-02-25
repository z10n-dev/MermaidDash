import { useState, useRef, useCallback, useEffect } from 'react';
import svgPanZoom from 'svg-pan-zoom';

export type ToolMode = 'pan' | 'select' | 'style' | 'add-node' | 'connector' | 'text' | null;

type SvgPanZoomInstance = ReturnType<typeof svgPanZoom>;

export function useCanvasInteraction() {
  const [toolMode, setToolMode] = useState<ToolMode>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const instanceRef = useRef<SvgPanZoomInstance | null>(null);
  const toolModeRef = useRef<ToolMode>(null);

  // Keep ref in sync for use in callbacks
  useEffect(() => {
    toolModeRef.current = toolMode;
  }, [toolMode]);

  // Space key for temporary pan mode
  const spaceHeldRef = useRef(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat && !spaceHeldRef.current) {
        // Don't hijack space when typing in an input/textarea
        const tag = (e.target as HTMLElement).tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        e.preventDefault();
        spaceHeldRef.current = true;
        setToolMode('pan');
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' && spaceHeldRef.current) {
        e.preventDefault();
        spaceHeldRef.current = false;
        setToolMode(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Toggle pan based on tool mode
  useEffect(() => {
    const pz = instanceRef.current;
    if (!pz) return;
    if (toolMode === 'pan') {
      pz.enablePan();
    } else {
      pz.disablePan();
    }
  }, [toolMode]);

  const getCodePanelWidth = useCallback(() => {
    const panel = document.querySelector('[data-code-panel]') as HTMLElement | null;
    if (!panel || panel.offsetParent === null) return 0;
    return panel.offsetWidth;
  }, []);

  const fitToVisibleArea = useCallback((pz: SvgPanZoomInstance) => {
    const panelWidth = getCodePanelWidth();
    if (panelWidth <= 0) return;

    const sizes = pz.getSizes();
    const viewportWidth = sizes.width;
    const visibleWidth = viewportWidth - panelWidth;

    // Scale down so content fits within visible width
    const zoom = pz.getZoom();
    const realZoom = sizes.realZoom;
    const contentWidth = sizes.viewBox.width * realZoom;
    const newZoom = zoom * (visibleWidth / viewportWidth);
    pz.zoom(newZoom);

    // After zoom, re-center content in the visible area
    // The visible area spans from panelWidth to viewportWidth
    // We want content centered at panelWidth + visibleWidth/2
    const newRealZoom = pz.getSizes().realZoom;
    const scaledContentWidth = sizes.viewBox.width * newRealZoom;
    const scaledContentHeight = sizes.viewBox.height * newRealZoom;
    const centerX = panelWidth + (visibleWidth - scaledContentWidth) / 2;
    const centerY = (sizes.height - scaledContentHeight) / 2;
    pz.pan({ x: centerX, y: centerY });

    setZoomLevel(pz.getZoom());
  }, [getCodePanelWidth]);

  const initSvgPanZoom = useCallback((svgElement: SVGSVGElement | null) => {
    // Capture previous pan/zoom state before destroying
    let prevState: { zoom: number; pan: { x: number; y: number } } | null = null;
    if (instanceRef.current) {
      prevState = {
        zoom: instanceRef.current.getZoom(),
        pan: instanceRef.current.getPan(),
      };
      instanceRef.current.destroy();
      instanceRef.current = null;
    }
    if (!svgElement) return;

    const instance = svgPanZoom(svgElement, {
      fit: true,
      center: true,
      contain: false,
      minZoom: 0.1,
      maxZoom: 12,
      zoomScaleSensitivity: 0.3,
      dblClickZoomEnabled: false,
      panEnabled: toolModeRef.current === 'pan',
      mouseWheelZoomEnabled: true,
      preventMouseEventsDefault: false,
      onZoom: (scale: number) => {
        setZoomLevel(scale);
      },
    });

    if (prevState) {
      // Restore previous pan/zoom state
      instance.zoom(prevState.zoom);
      instance.pan(prevState.pan);
      setZoomLevel(prevState.zoom);
    } else {
      // First init: zoom out slightly for toolbar clearance
      instance.zoom(instance.getZoom() * 0.875);
      setZoomLevel(instance.getZoom());
      fitToVisibleArea(instance);
    }

    instanceRef.current = instance;
  }, [fitToVisibleArea]);

  const zoomIn = useCallback(() => {
    instanceRef.current?.zoomIn();
    if (instanceRef.current) setZoomLevel(instanceRef.current.getZoom());
  }, []);

  const zoomOut = useCallback(() => {
    instanceRef.current?.zoomOut();
    if (instanceRef.current) setZoomLevel(instanceRef.current.getZoom());
  }, []);

  const fitToScreen = useCallback(() => {
    const pz = instanceRef.current;
    if (!pz) return;
    pz.resize();
    pz.fit();
    pz.center();
    pz.zoom(pz.getZoom() * 0.875);
    setZoomLevel(pz.getZoom());
    fitToVisibleArea(pz);
  }, [fitToVisibleArea]);

  const resetView = useCallback(() => {
    const pz = instanceRef.current;
    if (!pz) return;
    pz.reset();
    pz.zoom(pz.getZoom() * 0.875);
    setZoomLevel(pz.getZoom());
  }, []);

  useEffect(() => {
    return () => {
      instanceRef.current?.destroy();
    };
  }, []);

  return {
    toolMode,
    setToolMode,
    zoomLevel,
    zoomIn,
    zoomOut,
    fitToScreen,
    resetView,
    initSvgPanZoom,
    instanceRef,
  };
}
