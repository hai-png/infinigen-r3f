/**
 * Decal Application System - Logo placement, labels, projected decals
 */
import { CanvasTexture, Color, Vector3 } from 'three';
import { FixedSeed } from '../../../core/util/math/utils';
export class DecalSystem {
    generateDecal(params, seed) {
        const rng = new FixedSeed(seed);
        const size = 512;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx)
            return new CanvasTexture(canvas);
        // Transparent background
        ctx.clearRect(0, 0, size, size);
        switch (params.type) {
            case 'logo':
                this.drawLogo(ctx, size, params, rng);
                break;
            case 'label':
                this.drawLabel(ctx, size, params, rng);
                break;
            case 'warning':
                this.drawWarning(ctx, size, params, rng);
                break;
        }
        return new CanvasTexture(canvas);
    }
    drawLogo(ctx, size, params, rng) {
        ctx.save();
        ctx.translate(size / 2, size / 2);
        ctx.rotate(params.rotation);
        ctx.fillStyle = `rgba(${params.color.r * 255}, ${params.color.g * 255}, ${params.color.b * 255}, ${params.opacity})`;
        ctx.beginPath();
        ctx.arc(0, 0, size * 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 40px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('LOGO', 0, 15);
        ctx.restore();
    }
    drawLabel(ctx, size, params, rng) {
        ctx.save();
        ctx.translate(size / 2, size / 2);
        ctx.rotate(params.rotation);
        ctx.fillStyle = `rgba(${params.color.r * 255}, ${params.color.g * 255}, ${params.color.b * 255}, ${params.opacity})`;
        ctx.fillRect(-size * 0.4, -size * 0.15, size * 0.8, size * 0.3);
        ctx.fillStyle = '#000000';
        ctx.font = '24px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('LABEL', 0, 10);
        ctx.restore();
    }
    drawWarning(ctx, size, params, rng) {
        ctx.save();
        ctx.translate(size / 2, size / 2);
        ctx.rotate(params.rotation);
        // Yellow triangle
        ctx.fillStyle = '#ffff00';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, -size * 0.35);
        ctx.lineTo(size * 0.3, size * 0.3);
        ctx.lineTo(-size * 0.3, size * 0.3);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        // Exclamation mark
        ctx.fillStyle = '#000000';
        ctx.font = 'bold 60px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('!', 0, 20);
        ctx.restore();
    }
    calculatePlacement(surfaceNormal, offset) {
        return {
            position: surfaceNormal.clone().normalize().multiplyScalar(offset),
            normal: surfaceNormal.clone().normalize(),
            rotation: Math.random() * Math.PI * 2,
            scale: 1.0,
        };
    }
    getDefaultParams() {
        return {
            type: 'label',
            color: new Color(0xffffff),
            opacity: 0.9,
            scale: new Vector3(1, 1, 1),
            rotation: 0,
        };
    }
}
//# sourceMappingURL=DecalSystem.js.map