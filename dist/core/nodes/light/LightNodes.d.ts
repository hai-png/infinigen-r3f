/**
 * Light Nodes - Light source definitions and properties
 * Based on Blender's light nodes and Three.js light types
 *
 * @module nodes/light
 */
import { Color, Vector3 } from 'three';
import { Node, NodeSocket } from '../../core/types.js';
import { NodeTypes } from '../../core/node-types.js';
/**
 * PointLight Node
 * Omnidirectional point light source
 */
export interface PointLightNode extends Node {
    type: NodeTypes.PointLight;
    inputs: {
        Color: NodeSocket<Color>;
        Strength: NodeSocket<number>;
        Position: NodeSocket<Vector3>;
    };
    outputs: {
        Light: NodeSocket<any>;
    };
    params: {
        intensity: number;
        distance: number;
        decay: number;
    };
}
export declare const PointLightDefinition: {
    type: any;
    label: string;
    category: string;
    inputs: ({
        name: string;
        type: string;
        default: Color;
    } | {
        name: string;
        type: string;
        default: number;
    } | {
        name: string;
        type: string;
        default: Vector3;
    })[];
    outputs: {
        name: string;
        type: string;
    }[];
    params: {
        intensity: {
            type: string;
            default: number;
            min: number;
            max: number;
        };
        distance: {
            type: string;
            default: number;
            min: number;
        };
        decay: {
            type: string;
            default: number;
            min: number;
            max: number;
        };
    };
};
/**
 * SpotLight Node
 * Directional spotlight with cone angle
 */
export interface SpotLightNode extends Node {
    type: NodeTypes.SpotLight;
    inputs: {
        Color: NodeSocket<Color>;
        Strength: NodeSocket<number>;
        Position: NodeSocket<Vector3>;
        Target: NodeSocket<Vector3>;
    };
    outputs: {
        Light: NodeSocket<any>;
    };
    params: {
        intensity: number;
        distance: number;
        angle: number;
        penumbra: number;
        decay: number;
    };
}
export declare const SpotLightDefinition: {
    type: any;
    label: string;
    category: string;
    inputs: ({
        name: string;
        type: string;
        default: Color;
    } | {
        name: string;
        type: string;
        default: number;
    } | {
        name: string;
        type: string;
        default: Vector3;
    })[];
    outputs: {
        name: string;
        type: string;
    }[];
    params: {
        intensity: {
            type: string;
            default: number;
            min: number;
            max: number;
        };
        distance: {
            type: string;
            default: number;
            min: number;
        };
        angle: {
            type: string;
            default: number;
            min: number;
            max: number;
        };
        penumbra: {
            type: string;
            default: number;
            min: number;
            max: number;
        };
        decay: {
            type: string;
            default: number;
            min: number;
            max: number;
        };
    };
};
/**
 * AreaLight Node
 * Rectangular area light source
 */
export interface AreaLightNode extends Node {
    type: NodeTypes.AreaLight;
    inputs: {
        Color: NodeSocket<Color>;
        Strength: NodeSocket<number>;
        Position: NodeSocket<Vector3>;
    };
    outputs: {
        Light: NodeSocket<any>;
    };
    params: {
        intensity: number;
        width: number;
        height: number;
        shape: 'rectangle' | 'disk' | 'sphere';
    };
}
export declare const AreaLightDefinition: {
    type: any;
    label: string;
    category: string;
    inputs: ({
        name: string;
        type: string;
        default: Color;
    } | {
        name: string;
        type: string;
        default: number;
    } | {
        name: string;
        type: string;
        default: Vector3;
    })[];
    outputs: {
        name: string;
        type: string;
    }[];
    params: {
        intensity: {
            type: string;
            default: number;
            min: number;
            max: number;
        };
        width: {
            type: string;
            default: number;
            min: number;
            max: number;
        };
        height: {
            type: string;
            default: number;
            min: number;
            max: number;
        };
        shape: {
            type: string;
            options: string[];
            default: string;
        };
    };
};
/**
 * SunLight Node
 * Directional sun light (infinite distance)
 */
export interface SunLightNode extends Node {
    type: NodeTypes.SunLight;
    inputs: {
        Color: NodeSocket<Color>;
        Strength: NodeSocket<number>;
        Direction: NodeSocket<Vector3>;
    };
    outputs: {
        Light: NodeSocket<any>;
    };
    params: {
        intensity: number;
        angle: number;
    };
}
export declare const SunLightDefinition: {
    type: any;
    label: string;
    category: string;
    inputs: ({
        name: string;
        type: string;
        default: Color;
    } | {
        name: string;
        type: string;
        default: number;
    } | {
        name: string;
        type: string;
        default: Vector3;
    })[];
    outputs: {
        name: string;
        type: string;
    }[];
    params: {
        intensity: {
            type: string;
            default: number;
            min: number;
            max: number;
        };
        angle: {
            type: string;
            default: number;
            min: number;
            max: number;
        };
    };
};
/**
 * LightFalloff Node
 * Controls light attenuation over distance
 */
export interface LightFalloffNode extends Node {
    type: NodeTypes.LightFalloff;
    inputs: {
        Strength: NodeSocket<number>;
        Smooth: NodeSocket<number>;
    };
    outputs: {
        Strength: NodeSocket<number>;
    };
    params: {
        constant: number;
        linear: number;
        quadratic: number;
    };
}
export declare const LightFalloffDefinition: {
    type: any;
    label: string;
    category: string;
    inputs: {
        name: string;
        type: string;
        default: number;
    }[];
    outputs: {
        name: string;
        type: string;
    }[];
    params: {
        constant: {
            type: string;
            default: number;
            min: number;
        };
        linear: {
            type: string;
            default: number;
            min: number;
        };
        quadratic: {
            type: string;
            default: number;
            min: number;
        };
    };
};
/**
 * LightAttenuation Node
 * Custom attenuation curve for lights
 */
export interface LightAttenuationNode extends Node {
    type: NodeTypes.LightAttenuation;
    inputs: {
        Distance: NodeSocket<number>;
        Curve: NodeSocket<any>;
    };
    outputs: {
        Factor: NodeSocket<number>;
    };
    params: {
        useCustomCurve: boolean;
    };
}
export declare const LightAttenuationDefinition: {
    type: any;
    label: string;
    category: string;
    inputs: ({
        name: string;
        type: string;
        default: number;
    } | {
        name: string;
        type: string;
        default: null;
    })[];
    outputs: {
        name: string;
        type: string;
    }[];
    params: {
        useCustomCurve: {
            type: string;
            default: boolean;
        };
    };
};
import { PointLight as ThreePointLight, SpotLight as ThreeSpotLight, DirectionalLight } from 'three';
export declare function createPointLight(color: Color, strength: number, position: Vector3, intensity?: number, distance?: number, decay?: number): ThreePointLight;
export declare function createSpotLight(color: Color, strength: number, position: Vector3, target: Vector3, intensity?: number, distance?: number, angle?: number, penumbra?: number, decay?: number): ThreeSpotLight;
export declare function createSunLight(color: Color, strength: number, direction: Vector3, intensity?: number): DirectionalLight;
export declare function calculateFalloff(distance: number, strength: number, smooth: number, constant?: number, linear?: number, quadratic?: number): number;
export declare const LightNodes: {
    PointLight: {
        type: any;
        label: string;
        category: string;
        inputs: ({
            name: string;
            type: string;
            default: Color;
        } | {
            name: string;
            type: string;
            default: number;
        } | {
            name: string;
            type: string;
            default: Vector3;
        })[];
        outputs: {
            name: string;
            type: string;
        }[];
        params: {
            intensity: {
                type: string;
                default: number;
                min: number;
                max: number;
            };
            distance: {
                type: string;
                default: number;
                min: number;
            };
            decay: {
                type: string;
                default: number;
                min: number;
                max: number;
            };
        };
    };
    SpotLight: {
        type: any;
        label: string;
        category: string;
        inputs: ({
            name: string;
            type: string;
            default: Color;
        } | {
            name: string;
            type: string;
            default: number;
        } | {
            name: string;
            type: string;
            default: Vector3;
        })[];
        outputs: {
            name: string;
            type: string;
        }[];
        params: {
            intensity: {
                type: string;
                default: number;
                min: number;
                max: number;
            };
            distance: {
                type: string;
                default: number;
                min: number;
            };
            angle: {
                type: string;
                default: number;
                min: number;
                max: number;
            };
            penumbra: {
                type: string;
                default: number;
                min: number;
                max: number;
            };
            decay: {
                type: string;
                default: number;
                min: number;
                max: number;
            };
        };
    };
    AreaLight: {
        type: any;
        label: string;
        category: string;
        inputs: ({
            name: string;
            type: string;
            default: Color;
        } | {
            name: string;
            type: string;
            default: number;
        } | {
            name: string;
            type: string;
            default: Vector3;
        })[];
        outputs: {
            name: string;
            type: string;
        }[];
        params: {
            intensity: {
                type: string;
                default: number;
                min: number;
                max: number;
            };
            width: {
                type: string;
                default: number;
                min: number;
                max: number;
            };
            height: {
                type: string;
                default: number;
                min: number;
                max: number;
            };
            shape: {
                type: string;
                options: string[];
                default: string;
            };
        };
    };
    SunLight: {
        type: any;
        label: string;
        category: string;
        inputs: ({
            name: string;
            type: string;
            default: Color;
        } | {
            name: string;
            type: string;
            default: number;
        } | {
            name: string;
            type: string;
            default: Vector3;
        })[];
        outputs: {
            name: string;
            type: string;
        }[];
        params: {
            intensity: {
                type: string;
                default: number;
                min: number;
                max: number;
            };
            angle: {
                type: string;
                default: number;
                min: number;
                max: number;
            };
        };
    };
    LightFalloff: {
        type: any;
        label: string;
        category: string;
        inputs: {
            name: string;
            type: string;
            default: number;
        }[];
        outputs: {
            name: string;
            type: string;
        }[];
        params: {
            constant: {
                type: string;
                default: number;
                min: number;
            };
            linear: {
                type: string;
                default: number;
                min: number;
            };
            quadratic: {
                type: string;
                default: number;
                min: number;
            };
        };
    };
    LightAttenuation: {
        type: any;
        label: string;
        category: string;
        inputs: ({
            name: string;
            type: string;
            default: number;
        } | {
            name: string;
            type: string;
            default: null;
        })[];
        outputs: {
            name: string;
            type: string;
        }[];
        params: {
            useCustomCurve: {
                type: string;
                default: boolean;
            };
        };
    };
};
export declare const LightFunctions: {
    createPointLight: typeof createPointLight;
    createSpotLight: typeof createSpotLight;
    createSunLight: typeof createSunLight;
    calculateFalloff: typeof calculateFalloff;
};
//# sourceMappingURL=LightNodes.d.ts.map