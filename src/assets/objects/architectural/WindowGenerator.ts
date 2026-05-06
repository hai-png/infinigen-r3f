/**
 * Procedural Window Generator for Infinigen R3F
 * Generates various window types: casement, doubleHung, awning, picture, sliding, bay
 * FIX: Each window type now produces distinct geometry
 *
 * @deprecated Use `articulated/WindowGenerator` instead, which extends ArticulatedObjectBase
 *           and provides joint metadata + MJCF/URDF export. This architectural version
 *           will be removed in a future release.
 */

import {
  Group, Mesh, BoxGeometry, CylinderGeometry, BufferGeometry, SphereGeometry,
  Float32BufferAttribute, MeshStandardMaterial, Color, Vector3, PlaneGeometry
} from 'three';
import * as THREE from 'three';
import { SeededRandom } from '../../../core/util/math/index';
import { BaseObjectGenerator, BaseGeneratorConfig } from '../utils/BaseObjectGenerator';

export type WindowType = 'casement' | 'doubleHung' | 'awning' | 'picture' | 'sliding' | 'bay';

export interface WindowParams extends BaseGeneratorConfig {
  width: number;
  height: number;
  depth: number;
  type: WindowType;
  style: 'modern' | 'traditional' | 'industrial' | 'rustic' | 'victorian';
  paneCount: number;
  hasShutters: boolean;
  frameMaterial: 'wood' | 'metal' | 'vinyl' | 'aluminum';
  glassType: 'clear' | 'frosted' | 'tinted' | 'stained';
  sillDepth: number;
  /** Optional curtain: 'none' (default), 'rod', 'roman', 'roller' */
  curtainType: 'none' | 'rod' | 'roman' | 'roller';
  /** Curtain fabric color as hex number */
  curtainColor: number;
  /** Curtain open amount: 0 = fully closed, 1 = fully open */
  curtainOpenAmount: number;
}

/**
 * @deprecated Use `import { WindowGenerator } from '../articulated/WindowGenerator'` instead.
 *           The articulated version includes physics joint definitions and MJCF export.
 */
export class WindowGenerator extends BaseObjectGenerator<WindowParams> {
  public getDefaultConfig(): WindowParams {
    return {
      width: 1.2 + this.rng.range(-0.3, 0.6),
      height: 1.5 + this.rng.range(-0.3, 0.8),
      depth: 0.15 + this.rng.range(0, 0.1),
      type: this.rng.choice(['casement', 'doubleHung', 'awning', 'picture', 'sliding', 'bay']),
      style: this.rng.choice(['modern', 'traditional', 'industrial', 'rustic', 'victorian']),
      paneCount: this.rng.int(2, 12),
      hasShutters: this.rng.boolean(0.4),
      frameMaterial: this.rng.choice(['wood', 'metal', 'vinyl', 'aluminum']),
      glassType: this.rng.choice(['clear', 'frosted', 'tinted', 'stained']),
      sillDepth: 0.1 + this.rng.range(0, 0.15),
      curtainType: 'none',
      curtainColor: 0xf5f0e8,
      curtainOpenAmount: 0,
    };
  }

  generate(params?: Partial<WindowParams>): Group {
    const finalParams = { ...this.getDefaultConfig(), ...params };
    return this.createWindow(finalParams);
  }

  private createWindow(params: WindowParams): Group {
    const group = new Group();

    switch (params.type) {
      case 'casement':
        this.createCasementWindow(group, params);
        break;
      case 'doubleHung':
        this.createDoubleHungWindow(group, params);
        break;
      case 'awning':
        this.createAwningWindow(group, params);
        break;
      case 'picture':
        this.createPictureWindow(group, params);
        break;
      case 'sliding':
        this.createSlidingWindow(group, params);
        break;
      case 'bay':
        this.createBayWindow(group, params);
        break;
    }

    // Add shutters if specified (not for bay or awning)
    if (params.hasShutters && params.type !== 'bay' && params.type !== 'awning') {
      const shutters = this.createShutters(params);
      shutters.forEach(s => group.add(s));
    }

    // Add window sill (for all types)
    const sill = this.createSill(params);
    group.add(sill);

    // Add curtain if requested
    if (params.curtainType !== 'none') {
      const curtain = this.createCurtain(params);
      group.add(curtain);
    }

    return group;
  }

  // ===== CASEMENT: Side-hinged panel(s) that open outward =====
  private createCasementWindow(group: Group, params: WindowParams): void {
    const frameMat = this.getFrameMaterial(params);
    const glassMat = this.getGlassMaterial(params);
    const ft = 0.06; // frame thickness
    const { width, height, depth } = params;

    // Outer frame (4 bars)
    this.addRectFrame(group, width, height, depth, ft, frameMat);

    // Two side-hinged panels with center mullion
    const panelWidth = (width - ft * 3) / 2;
    const panelHeight = height - ft * 2;
    const glassThickness = 0.01;

    // Center mullion
    const mullionGeo = new BoxGeometry(ft, panelHeight, depth);
    const mullion = new Mesh(mullionGeo, frameMat);
    mullion.position.set(0, 0, 0);
    mullion.castShadow = true;
    group.add(mullion);

    // Left panel (hinged on left side, swings outward)
    const leftPanelGroup = new Group();
    leftPanelGroup.name = 'casement_left_panel';

    // Panel frame
    const lft = 0.03; // panel frame thickness
    const leftTopBar = new Mesh(new BoxGeometry(panelWidth, lft, depth * 0.6), frameMat);
    leftTopBar.position.set(panelWidth / 2, panelHeight / 2 - lft / 2, 0);
    leftPanelGroup.add(leftTopBar);
    const leftBottomBar = new Mesh(new BoxGeometry(panelWidth, lft, depth * 0.6), frameMat);
    leftBottomBar.position.set(panelWidth / 2, -panelHeight / 2 + lft / 2, 0);
    leftPanelGroup.add(leftBottomBar);
    const leftRightBar = new Mesh(new BoxGeometry(lft, panelHeight, depth * 0.6), frameMat);
    leftRightBar.position.set(panelWidth - lft / 2, 0, 0);
    leftPanelGroup.add(leftRightBar);
    const leftLeftBar = new Mesh(new BoxGeometry(lft, panelHeight, depth * 0.6), frameMat);
    leftLeftBar.position.set(lft / 2, 0, 0);
    leftPanelGroup.add(leftLeftBar);

    // Glass pane
    const leftGlass = new Mesh(
      new BoxGeometry(panelWidth - lft * 2, panelHeight - lft * 2, glassThickness),
      glassMat
    );
    leftGlass.position.set(panelWidth / 2, 0, 0);
    leftPanelGroup.add(leftGlass);

    // Hinge point at left edge of left panel
    leftPanelGroup.position.set(-width / 2 + ft, 0, 0);
    // Slight outward rotation to show it's a casement
    leftPanelGroup.rotation.y = 0.15;
    group.add(leftPanelGroup);

    // Right panel (hinged on right side)
    const rightPanelGroup = new Group();
    rightPanelGroup.name = 'casement_right_panel';

    const rightTopBar = new Mesh(new BoxGeometry(panelWidth, lft, depth * 0.6), frameMat);
    rightTopBar.position.set(-panelWidth / 2, panelHeight / 2 - lft / 2, 0);
    rightPanelGroup.add(rightTopBar);
    const rightBottomBar = new Mesh(new BoxGeometry(panelWidth, lft, depth * 0.6), frameMat);
    rightBottomBar.position.set(-panelWidth / 2, -panelHeight / 2 + lft / 2, 0);
    rightPanelGroup.add(rightBottomBar);
    const rightLeftBar = new Mesh(new BoxGeometry(lft, panelHeight, depth * 0.6), frameMat);
    rightLeftBar.position.set(-panelWidth + lft / 2, 0, 0);
    rightPanelGroup.add(rightLeftBar);
    const rightRightBar = new Mesh(new BoxGeometry(lft, panelHeight, depth * 0.6), frameMat);
    rightRightBar.position.set(-lft / 2, 0, 0);
    rightPanelGroup.add(rightRightBar);

    const rightGlass = new Mesh(
      new BoxGeometry(panelWidth - lft * 2, panelHeight - lft * 2, glassThickness),
      glassMat
    );
    rightGlass.position.set(-panelWidth / 2, 0, 0);
    rightPanelGroup.add(rightGlass);

    rightPanelGroup.position.set(width / 2 - ft, 0, 0);
    rightPanelGroup.rotation.y = -0.15;
    group.add(rightPanelGroup);

    // Handle/knob in center
    const handleMat = new MeshStandardMaterial({ color: 0xcccccc, metalness: 0.8, roughness: 0.2 });
    const handleGeo = new CylinderGeometry(0.015, 0.015, 0.08, 8);
    const handle = new Mesh(handleGeo, handleMat);
    handle.rotation.x = Math.PI / 2;
    handle.position.set(ft / 2 + 0.02, 0, depth / 2 + 0.04);
    group.add(handle);
  }

  // ===== DOUBLE-HUNG: Two sashes, meeting rail in middle =====
  private createDoubleHungWindow(group: Group, params: WindowParams): void {
    const frameMat = this.getFrameMaterial(params);
    const glassMat = this.getGlassMaterial(params);
    const ft = 0.06;
    const { width, height, depth } = params;

    // Outer frame
    this.addRectFrame(group, width, height, depth, ft, frameMat);

    const sashWidth = width - ft * 2;
    const sashHeight = (height - ft * 2) / 2 - 0.02; // slight gap for meeting rail
    const sashFt = 0.03;
    const glassThickness = 0.01;

    // Bottom sash (slides up)
    const bottomSash = new Group();
    bottomSash.name = 'double_hung_bottom_sash';
    // Sash frame
    this.addPanelFrame(bottomSash, sashWidth, sashHeight, sashFt, depth * 0.6, frameMat);
    // Glass
    const bottomGlass = new Mesh(
      new BoxGeometry(sashWidth - sashFt * 2, sashHeight - sashFt * 2, glassThickness),
      glassMat
    );
    bottomSash.add(bottomGlass);
    bottomSash.position.set(0, -sashHeight / 2 - ft / 2 + 0.01, 0);
    group.add(bottomSash);

    // Top sash (slides down)
    const topSash = new Group();
    topSash.name = 'double_hung_top_sash';
    this.addPanelFrame(topSash, sashWidth, sashHeight, sashFt, depth * 0.6, frameMat);
    const topGlass = new Mesh(
      new BoxGeometry(sashWidth - sashFt * 2, sashHeight - sashFt * 2, glassThickness),
      glassMat
    );
    topSash.add(topGlass);
    topSash.position.set(0, sashHeight / 2 + ft / 2 - 0.01, 0);
    group.add(topSash);

    // Meeting rail (horizontal bar in the middle where the two sashes meet)
    const meetingRailGeo = new BoxGeometry(sashWidth, 0.03, depth * 0.7);
    const meetingRail = new Mesh(meetingRailGeo, frameMat);
    meetingRail.position.set(0, 0, 0);
    meetingRail.castShadow = true;
    meetingRail.name = 'meeting_rail';
    group.add(meetingRail);

    // Lock on meeting rail
    const lockMat = new MeshStandardMaterial({ color: 0xcccccc, metalness: 0.8, roughness: 0.2 });
    const lockGeo = new BoxGeometry(0.04, 0.025, 0.03);
    const lock = new Mesh(lockGeo, lockMat);
    lock.position.set(0, 0.015, depth / 2 + 0.015);
    group.add(lock);
  }

  // ===== SLIDING: Horizontal sliding panels (left/right offset) =====
  private createSlidingWindow(group: Group, params: WindowParams): void {
    const frameMat = this.getFrameMaterial(params);
    const glassMat = this.getGlassMaterial(params);
    const ft = 0.06;
    const { width, height, depth } = params;

    // Outer frame
    this.addRectFrame(group, width, height, depth, ft, frameMat);

    const panelWidth = width - ft * 2;
    const panelHeight = height - ft * 2;
    const panelFt = 0.03;
    const glassThickness = 0.01;

    // Left panel (slightly behind)
    const leftPanel = new Group();
    leftPanel.name = 'sliding_left_panel';
    this.addPanelFrame(leftPanel, panelWidth, panelHeight, panelFt, depth * 0.4, frameMat);
    const leftGlass = new Mesh(
      new BoxGeometry(panelWidth - panelFt * 2, panelHeight - panelFt * 2, glassThickness),
      glassMat
    );
    leftPanel.add(leftGlass);
    leftPanel.position.set(-panelWidth * 0.15, 0, -0.02);
    group.add(leftPanel);

    // Right panel (slightly in front, offset to the right)
    const rightPanel = new Group();
    rightPanel.name = 'sliding_right_panel';
    this.addPanelFrame(rightPanel, panelWidth, panelHeight, panelFt, depth * 0.4, frameMat);
    const rightGlass = new Mesh(
      new BoxGeometry(panelWidth - panelFt * 2, panelHeight - panelFt * 2, glassThickness),
      glassMat
    );
    rightPanel.add(rightGlass);
    rightPanel.position.set(panelWidth * 0.15, 0, 0.02);
    group.add(rightPanel);

    // Horizontal interlock where panels overlap
    const interlockGeo = new BoxGeometry(0.02, panelHeight, depth * 0.5);
    const interlock = new Mesh(interlockGeo, frameMat);
    interlock.position.set(panelWidth * 0.15 - panelWidth / 2 + panelFt, 0, 0);
    interlock.name = 'interlock';
    group.add(interlock);

    // Handle
    const handleMat = new MeshStandardMaterial({ color: 0xcccccc, metalness: 0.8, roughness: 0.2 });
    const handleGeo = new BoxGeometry(0.06, 0.025, 0.025);
    const handle = new Mesh(handleGeo, handleMat);
    handle.position.set(panelWidth * 0.15 - panelWidth / 4, 0, depth / 2 + 0.01);
    group.add(handle);
  }

  // ===== BAY: Three angled panes projecting outward =====
  private createBayWindow(group: Group, params: WindowParams): void {
    const frameMat = this.getFrameMaterial(params);
    const glassMat = this.getGlassMaterial(params);
    const ft = 0.06;
    const { width, height, depth } = params;

    const bayProjection = 0.4 + width * 0.15; // how far the bay extends
    const sideAngle = Math.PI / 6; // ~30 degrees
    const sidePanelWidth = width * 0.35;
    const centerPanelWidth = width * 0.4;

    // Center pane - flat, projected forward
    const centerFrame = new Group();
    this.addRectFrame(centerFrame, centerPanelWidth, height, depth, ft, frameMat);
    const centerGlass = new Mesh(
      new BoxGeometry(centerPanelWidth - ft * 2, height - ft * 2, 0.01),
      glassMat
    );
    centerFrame.add(centerGlass);
    centerFrame.position.set(0, 0, bayProjection);
    group.add(centerFrame);

    // Left side pane - angled
    const leftFrame = new Group();
    this.addRectFrame(leftFrame, sidePanelWidth, height, depth, ft, frameMat);
    const leftGlass = new Mesh(
      new BoxGeometry(sidePanelWidth - ft * 2, height - ft * 2, 0.01),
      glassMat
    );
    leftFrame.add(leftGlass);
    leftFrame.position.set(-centerPanelWidth / 2 - sidePanelWidth / 2 * Math.cos(sideAngle), 0, bayProjection / 2);
    leftFrame.rotation.y = sideAngle;
    group.add(leftFrame);

    // Right side pane - angled
    const rightFrame = new Group();
    this.addRectFrame(rightFrame, sidePanelWidth, height, depth, ft, frameMat);
    const rightGlass = new Mesh(
      new BoxGeometry(sidePanelWidth - ft * 2, height - ft * 2, 0.01),
      glassMat
    );
    rightFrame.add(rightGlass);
    rightFrame.position.set(centerPanelWidth / 2 + sidePanelWidth / 2 * Math.cos(sideAngle), 0, bayProjection / 2);
    rightFrame.rotation.y = -sideAngle;
    group.add(rightFrame);

    // Side walls connecting bay to wall
    const wallMat = new MeshStandardMaterial({ color: this.getFrameColor(params), roughness: 0.7 });
    const sideWallWidth = bayProjection / Math.cos(sideAngle);
    for (const side of [-1, 1]) {
      const wallGeo = new BoxGeometry(0.05, height, sideWallWidth);
      const wall = new Mesh(wallGeo, wallMat);
      wall.position.set(side * (centerPanelWidth / 2 + 0.025), 0, bayProjection / 2);
      wall.rotation.y = side * sideAngle;
      wall.castShadow = true;
      group.add(wall);
    }

    // Top shelf/seat board
    const topBoardGeo = new BoxGeometry(centerPanelWidth + sidePanelWidth * 2 * Math.cos(sideAngle) + 0.1, 0.04, bayProjection + 0.05);
    const topBoard = new Mesh(topBoardGeo, wallMat);
    topBoard.position.set(0, height / 2 + 0.02, bayProjection / 2);
    group.add(topBoard);

    // Bottom seat board
    const bottomBoardGeo = new BoxGeometry(centerPanelWidth + sidePanelWidth * 2 * Math.cos(sideAngle) + 0.1, 0.04, bayProjection + 0.05);
    const bottomBoard = new Mesh(bottomBoardGeo, wallMat);
    bottomBoard.position.set(0, -height / 2 - 0.02, bayProjection / 2);
    group.add(bottomBoard);
  }

  // ===== AWNING: Top-hinged panel that pushes outward from the bottom =====
  private createAwningWindow(group: Group, params: WindowParams): void {
    const frameMat = this.getFrameMaterial(params);
    const glassMat = this.getGlassMaterial(params);
    const ft = 0.06;
    const { width, height, depth } = params;

    // Outer frame (4 bars)
    this.addRectFrame(group, width, height, depth, ft, frameMat);

    // Single panel hinged at top, opening outward from the bottom
    const panelWidth = width - ft * 2;
    const panelHeight = height - ft * 2;
    const panelFt = 0.03;
    const glassThickness = 0.01;

    const awningPanel = new Group();
    awningPanel.name = 'awning_panel';

    // Panel frame bars
    this.addPanelFrame(awningPanel, panelWidth, panelHeight, panelFt, depth * 0.6, frameMat);

    // Glass pane
    const glass = new Mesh(
      new BoxGeometry(panelWidth - panelFt * 2, panelHeight - panelFt * 2, glassThickness),
      glassMat
    );
    awningPanel.add(glass);

    // Hinge at the top edge — position at top of frame and tilt outward
    awningPanel.position.set(0, height / 2 - ft, 0);
    // Pivot from the top edge: rotate around X axis at the top
    // The panel rotates outward from the bottom
    awningPanel.rotation.x = 0.2; // pushes bottom outward

    group.add(awningPanel);

    // Hinge hardware at top (two small cylinders)
    const hingeMat = new MeshStandardMaterial({ color: 0xcccccc, metalness: 0.8, roughness: 0.2 });
    for (const xOff of [-width / 2 + ft + 0.04, width / 2 - ft - 0.04]) {
      const hingeGeo = new CylinderGeometry(0.012, 0.012, 0.04, 8);
      const hinge = new Mesh(hingeGeo, hingeMat);
      hinge.rotation.z = Math.PI / 2;
      hinge.position.set(xOff, height / 2 - ft / 2, depth / 2 + 0.02);
      group.add(hinge);
    }

    // Crank handle at bottom center
    const crankGeo = new CylinderGeometry(0.012, 0.012, 0.06, 8);
    const crank = new Mesh(crankGeo, hingeMat);
    crank.rotation.x = Math.PI / 2;
    crank.position.set(0, -height / 2 + ft + 0.05, depth / 2 + 0.03);
    group.add(crank);
  }

  // ===== PICTURE: Large fixed pane with minimal frame =====
  private createPictureWindow(group: Group, params: WindowParams): void {
    const frameMat = this.getFrameMaterial(params);
    const glassMat = this.getGlassMaterial(params);
    const ft = 0.04; // thinner frame than other types — picture windows have minimal framing
    const { width, height, depth } = params;

    // Outer frame (4 thin bars)
    this.addRectFrame(group, width, height, depth, ft, frameMat);

    // Single large fixed glass pane — no mullions, no sashes
    const glassWidth = width - ft * 2;
    const glassHeight = height - ft * 2;
    const glassThickness = 0.012; // thicker glass for large pane
    const glass = new Mesh(
      new BoxGeometry(glassWidth, glassHeight, glassThickness),
      glassMat
    );
    glass.position.set(0, 0, 0);
    glass.name = 'picture_glass';
    group.add(glass);

    // Glazing bead around the edge (thin strips holding glass in frame)
    const beadMat = new MeshStandardMaterial({
      color: this.getFrameColor(params),
      roughness: 0.6,
    });
    const beadThickness = 0.01;
    const beadDepth = 0.015;
    // Top bead
    const topBead = new Mesh(new BoxGeometry(glassWidth, beadThickness, beadDepth), beadMat);
    topBead.position.set(0, glassHeight / 2 - beadThickness / 2, depth / 2 - beadDepth / 2);
    group.add(topBead);
    // Bottom bead
    const botBead = new Mesh(new BoxGeometry(glassWidth, beadThickness, beadDepth), beadMat);
    botBead.position.set(0, -glassHeight / 2 + beadThickness / 2, depth / 2 - beadDepth / 2);
    group.add(botBead);
    // Left bead
    const leftBead = new Mesh(new BoxGeometry(beadThickness, glassHeight, beadDepth), beadMat);
    leftBead.position.set(-glassWidth / 2 + beadThickness / 2, 0, depth / 2 - beadDepth / 2);
    group.add(leftBead);
    // Right bead
    const rightBead = new Mesh(new BoxGeometry(beadThickness, glassHeight, beadDepth), beadMat);
    rightBead.position.set(glassWidth / 2 - beadThickness / 2, 0, depth / 2 - beadDepth / 2);
    group.add(rightBead);
  }

  // ===== Helper: Add rectangular frame (4 bars) =====
  private addRectFrame(
    group: Group, w: number, h: number, d: number, ft: number, mat: MeshStandardMaterial
  ): void {
    // Top bar
    const top = new Mesh(new BoxGeometry(w, ft, d), mat);
    top.position.set(0, h / 2 - ft / 2, 0);
    top.castShadow = true;
    group.add(top);

    // Bottom bar
    const bottom = new Mesh(new BoxGeometry(w, ft, d), mat);
    bottom.position.set(0, -h / 2 + ft / 2, 0);
    bottom.castShadow = true;
    group.add(bottom);

    // Left bar
    const left = new Mesh(new BoxGeometry(ft, h, d), mat);
    left.position.set(-w / 2 + ft / 2, 0, 0);
    left.castShadow = true;
    group.add(left);

    // Right bar
    const right = new Mesh(new BoxGeometry(ft, h, d), mat);
    right.position.set(w / 2 - ft / 2, 0, 0);
    right.castShadow = true;
    group.add(right);
  }

  // ===== Helper: Add panel frame (4 bars around a sash/panel) =====
  private addPanelFrame(
    group: Group, w: number, h: number, ft: number, d: number, mat: MeshStandardMaterial
  ): void {
    const top = new Mesh(new BoxGeometry(w, ft, d), mat);
    top.position.set(0, h / 2 - ft / 2, 0);
    group.add(top);

    const bottom = new Mesh(new BoxGeometry(w, ft, d), mat);
    bottom.position.set(0, -h / 2 + ft / 2, 0);
    group.add(bottom);

    const left = new Mesh(new BoxGeometry(ft, h, d), mat);
    left.position.set(-w / 2 + ft / 2, 0, 0);
    group.add(left);

    const right = new Mesh(new BoxGeometry(ft, h, d), mat);
    right.position.set(w / 2 - ft / 2, 0, 0);
    group.add(right);
  }

  private createShutters(params: WindowParams): Group[] {
    const shutters: Group[] = [];
    const shutterColor = this.getShutterColor(params);
    const shutterMaterial = new MeshStandardMaterial({
      color: shutterColor,
      roughness: 0.6
    });

    for (const side of [-1, 1]) {
      const shutterGroup = new Group();
      const shutterWidth = params.width * 0.35;

      const panelGeo = new BoxGeometry(shutterWidth, params.height, 0.04);
      const panel = new Mesh(panelGeo, shutterMaterial);
      panel.castShadow = true;
      shutterGroup.add(panel);

      const slatCount = 5;
      for (let i = 0; i < slatCount; i++) {
        const y = ((i + 0.5) / slatCount - 0.5) * params.height;
        const slatGeo = new BoxGeometry(shutterWidth * 0.85, 0.03, 0.05);
        const slat = new Mesh(slatGeo, shutterMaterial);
        slat.position.y = y;
        slat.position.z = 0.025;
        shutterGroup.add(slat);
      }

      shutterGroup.position.set(side * (params.width / 2 + shutterWidth / 2 + 0.02), 0, 0);
      shutters.push(shutterGroup);
    }

    return shutters;
  }

  private createSill(params: WindowParams): Mesh {
    const sillMaterial = new MeshStandardMaterial({
      color: this.getFrameColor(params),
      roughness: 0.7
    });

    const sillGeo = new BoxGeometry(params.width + 0.2, 0.05, params.sillDepth);
    const sill = new Mesh(sillGeo, sillMaterial);
    sill.position.set(0, -params.height / 2 - 0.025, params.sillDepth / 2 - params.depth / 2);
    sill.castShadow = true;
    sill.receiveShadow = true;
    sill.name = 'sill';
    return sill;
  }

  // ===== CURTAIN: Rod, Roman, or Roller curtain =====
  private createCurtain(params: WindowParams): Group {
    const curtainGroup = new Group();
    curtainGroup.name = `curtain_${params.curtainType}`;
    const curtainMat = new MeshStandardMaterial({
      color: params.curtainColor,
      roughness: 0.9,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });

    const curtainZ = params.depth / 2 + 0.02; // Just in front of the window
    const openWidth = params.width * params.curtainOpenAmount;
    const closedWidth = params.width - openWidth;

    switch (params.curtainType) {
      case 'rod': {
        // Curtain rod (metal bar across the top)
        const rodMat = new MeshStandardMaterial({ color: 0x888888, metalness: 0.8, roughness: 0.3 });
        const rodGeo = new CylinderGeometry(0.015, 0.015, params.width + 0.2, 12);
        const rod = new Mesh(rodGeo, rodMat);
        rod.rotation.z = Math.PI / 2;
        rod.position.set(0, params.height / 2 + 0.05, curtainZ);
        rod.name = 'curtain_rod';
        curtainGroup.add(rod);

        // Finials (decorative ends)
        for (const side of [-1, 1]) {
          const finialGeo = new SphereGeometry(0.025, 12, 12);
          const finial = new Mesh(finialGeo, rodMat);
          finial.position.set(side * (params.width / 2 + 0.1), params.height / 2 + 0.05, curtainZ);
          finial.name = `finial_${side === -1 ? 'left' : 'right'}`;
          curtainGroup.add(finial);
        }

        // Curtain fabric panels (gathered, two panels that open from center)
        const panelWidth = closedWidth / 2;
        const curtainHeight = params.height * 0.95;

        if (panelWidth > 0.02) {
          for (const side of [-1, 1]) {
            // Gathered curtain panel
            const panelGeo = new THREE.PlaneGeometry(panelWidth, curtainHeight, 8, 1);
            // Add slight waviness for gathering effect
            const positions = panelGeo.attributes.position.array;
            for (let i = 0; i < positions.length; i += 3) {
              const x = positions[i];
              positions[i + 2] += Math.sin(x * 20) * 0.01; // Subtle gathers
            }
            panelGeo.attributes.position.needsUpdate = true;
            panelGeo.computeVertexNormals();

            const panel = new Mesh(panelGeo, curtainMat);
            const xCenter = side * (openWidth / 2 + panelWidth / 2);
            panel.position.set(xCenter, 0, curtainZ);
            panel.name = `curtain_panel_${side === -1 ? 'left' : 'right'}`;
            curtainGroup.add(panel);
          }
        }
        break;
      }

      case 'roman': {
        // Roman shade: flat fabric panel with horizontal folds
        const shadeWidth = params.width * 0.95;
        const shadeHeight = params.height * (1 - params.curtainOpenAmount * 0.7);

        const shadeGeo = new THREE.PlaneGeometry(shadeWidth, shadeHeight, 1, 12);
        // Add fold lines
        const positions = shadeGeo.attributes.position.array;
        const foldCount = 5;
        for (let i = 0; i < positions.length; i += 3) {
          const y = positions[i + 1];
          const foldT = (y / shadeHeight + 0.5); // 0 at bottom, 1 at top
          const fold = Math.sin(foldT * foldCount * Math.PI) * 0.008;
          positions[i + 2] += fold;
        }
        shadeGeo.attributes.position.needsUpdate = true;
        shadeGeo.computeVertexNormals();

        const shade = new Mesh(shadeGeo, curtainMat);
        shade.position.set(0, params.height / 2 - shadeHeight / 2, curtainZ);
        shade.name = 'roman_shade';
        curtainGroup.add(shade);

        // Headrail
        const headrailMat = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
        const headrailGeo = new BoxGeometry(shadeWidth + 0.04, 0.03, 0.03);
        const headrail = new Mesh(headrailGeo, headrailMat);
        headrail.position.set(0, params.height / 2 + 0.015, curtainZ);
        headrail.name = 'roman_headrail';
        curtainGroup.add(headrail);
        break;
      }

      case 'roller': {
        // Roller shade: cylindrical roller at top + flat fabric panel
        const shadeHeight = params.height * (1 - params.curtainOpenAmount * 0.8);
        const shadeWidth = params.width * 0.95;

        // Roller tube
        const tubeMat = new MeshStandardMaterial({ color: 0xdddddd, metalness: 0.3, roughness: 0.5 });
        const tubeGeo = new CylinderGeometry(0.02, 0.02, shadeWidth, 16);
        const tube = new Mesh(tubeGeo, tubeMat);
        tube.rotation.z = Math.PI / 2;
        tube.position.set(0, params.height / 2 + 0.02, curtainZ);
        tube.name = 'roller_tube';
        curtainGroup.add(tube);

        // Fabric panel
        if (shadeHeight > 0.05) {
          const shadeGeo = new THREE.PlaneGeometry(shadeWidth, shadeHeight);
          const shade = new Mesh(shadeGeo, curtainMat);
          shade.position.set(0, params.height / 2 - shadeHeight / 2, curtainZ);
          shade.name = 'roller_fabric';
          curtainGroup.add(shade);
        }

        // Bottom bar
        const barGeo = new BoxGeometry(shadeWidth, 0.015, 0.01);
        const bar = new Mesh(barGeo, tubeMat);
        bar.position.set(0, params.height / 2 - shadeHeight, curtainZ);
        bar.name = 'roller_bottom_bar';
        curtainGroup.add(bar);
        break;
      }
    }

    return curtainGroup;
  }

  private getGlassMaterial(params: WindowParams): MeshStandardMaterial {
    let color = 0x88ccff;
    let opacity = 0.3;
    let roughness = 0.1;

    switch (params.glassType) {
      case 'frosted': color = 0xcccccc; opacity = 0.5; roughness = 0.4; break;
      case 'tinted': color = 0x6688aa; opacity = 0.4; break;
      case 'stained': color = 0xaa6688; opacity = 0.6; break;
    }

    return new MeshStandardMaterial({
      color,
      transparent: true,
      opacity,
      roughness,
      metalness: 0.1
    });
  }

  private getFrameMaterial(params: WindowParams): MeshStandardMaterial {
    const color = this.getFrameColor(params);
    return new MeshStandardMaterial({
      color,
      roughness: params.frameMaterial === 'metal' ? 0.3 : 0.7,
      metalness: params.frameMaterial === 'metal' || params.frameMaterial === 'aluminum' ? 0.6 : 0.0,
    });
  }

  private getFrameColor(params: WindowParams): Color {
    switch (params.frameMaterial) {
      case 'wood': return new Color(0x4a3728);
      case 'metal': return new Color(0x333333);
      case 'vinyl': return new Color(0xffffff);
      case 'aluminum': return new Color(0xaaaaaa);
      default: return new Color(0x4a3728);
    }
  }

  private getShutterColor(params: WindowParams): Color {
    const colors = [0x2d5016, 0x1a1a1a, 0x4a3728, 0x8b0000, 0x003366];
    return new Color(this.rng.choice(colors));
  }

  validateParams(params: WindowParams): boolean {
    return (
      params.width > 0.5 && params.width < 4.0 &&
      params.height > 0.5 && params.height < 3.5 &&
      params.paneCount >= 1 && params.paneCount <= 24
    );
  }
}
