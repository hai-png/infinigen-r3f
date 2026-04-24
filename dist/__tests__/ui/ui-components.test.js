import { jsx as _jsx } from "react/jsx-runtime";
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
// Mock modules
jest.mock('../../constraints/language/types', () => ({}));
jest.mock('../../constraints/solver/moves', () => ({}));
jest.mock('../../constraints/evaluator/evaluate', () => ({
    evaluateProblem: jest.fn(() => ({ violations: [] })),
}));
describe('UI Components - Phase 11', () => {
    describe('UIPanel', () => {
        it('renders with title', () => {
            const UIPanel = require('../../ui/components/UIPanel').default;
            render(_jsx(UIPanel, { title: "Test Panel", children: "Content" }));
            expect(screen.getByText('Test Panel')).toBeInTheDocument();
            expect(screen.getByText('Content')).toBeInTheDocument();
        });
        it('can be collapsed', () => {
            const UIPanel = require('../../ui/components/UIPanel').default;
            render(_jsx(UIPanel, { title: "Test Panel", children: "Content" }));
            const header = screen.getByText('Test Panel').closest('div');
            fireEvent.click(header);
            expect(screen.queryByText('Content')).not.toBeInTheDocument();
        });
    });
    describe('Toolbar', () => {
        it('renders buttons', () => {
            const Toolbar = require('../../ui/components/Toolbar').default;
            const buttons = [
                { id: 'btn1', label: 'Button 1', icon: '🔧', onClick: jest.fn() },
                { id: 'btn2', label: 'Button 2', icon: '⚙️', onClick: jest.fn() },
            ];
            render(_jsx(Toolbar, { buttons: buttons }));
            expect(screen.getByText('Button 1')).toBeInTheDocument();
            expect(screen.getByText('Button 2')).toBeInTheDocument();
        });
        it('calls onClick when button clicked', () => {
            const Toolbar = require('../../ui/components/Toolbar').default;
            const handleClick = jest.fn();
            const buttons = [
                { id: 'btn1', label: 'Click Me', icon: '🔧', onClick: handleClick },
            ];
            render(_jsx(Toolbar, { buttons: buttons }));
            fireEvent.click(screen.getByText('Click Me'));
            expect(handleClick).toHaveBeenCalled();
        });
    });
    describe('PropertyGrid', () => {
        it('renders properties', () => {
            const PropertyGrid = require('../../ui/components/PropertyGrid').default;
            const properties = [
                { name: 'Name', type: 'string', value: 'Test', onChange: jest.fn() },
                { name: 'Count', type: 'number', value: 42, onChange: jest.fn() },
            ];
            render(_jsx(PropertyGrid, { properties: properties, searchable: false }));
            expect(screen.getByText('Name')).toBeInTheDocument();
            expect(screen.getByText('Count')).toBeInTheDocument();
        });
        it('filters properties on search', () => {
            const PropertyGrid = require('../../ui/components/PropertyGrid').default;
            const properties = [
                { name: 'Position', type: 'vector', value: [0, 0, 0], onChange: jest.fn() },
                { name: 'Rotation', type: 'vector', value: [0, 0, 0], onChange: jest.fn() },
            ];
            render(_jsx(PropertyGrid, { properties: properties }));
            const searchInput = screen.getByPlaceholderText('Search properties...');
            fireEvent.change(searchInput, { target: { value: 'Position' } });
            expect(screen.getByText('Position')).toBeInTheDocument();
            expect(screen.queryByText('Rotation')).not.toBeInTheDocument();
        });
    });
    describe('StatusBar', () => {
        it('renders default status', () => {
            const StatusBar = require('../../ui/components/StatusBar').default;
            render(_jsx(StatusBar, {}));
            expect(screen.getByText('Ready')).toBeInTheDocument();
        });
        it('displays system info', () => {
            const StatusBar = require('../../ui/components/StatusBar').default;
            render(_jsx(StatusBar, {}));
            expect(screen.getByText(/Objects:/)).toBeInTheDocument();
            expect(screen.getByText(/Constraints:/)).toBeInTheDocument();
            expect(screen.getByText(/FPS:/)).toBeInTheDocument();
        });
    });
    describe('AssetBrowser', () => {
        it('renders asset grid', () => {
            const AssetBrowser = require('../../ui/components/AssetBrowser').default;
            const assets = [
                { id: '1', name: 'Chair', thumbnail: '', category: 'furniture', tags: ['seat'], metadata: {} },
                { id: '2', name: 'Table', thumbnail: '', category: 'furniture', tags: ['surface'], metadata: {} },
            ];
            render(_jsx(AssetBrowser, { assets: assets }));
            expect(screen.getByText('Chair')).toBeInTheDocument();
            expect(screen.getByText('Table')).toBeInTheDocument();
        });
        it('filters by category', () => {
            const AssetBrowser = require('../../ui/components/AssetBrowser').default;
            const assets = [
                { id: '1', name: 'Chair', thumbnail: '', category: 'furniture', tags: [], metadata: {} },
                { id: '2', name: 'Lamp', thumbnail: '', category: 'lighting', tags: [], metadata: {} },
            ];
            render(_jsx(AssetBrowser, { assets: assets }));
            fireEvent.click(screen.getByText('Furniture'));
            expect(screen.getByText('Chair')).toBeInTheDocument();
        });
    });
    describe('PerformanceProfiler', () => {
        it('renders FPS display', () => {
            const PerformanceProfiler = require('../../ui/components/PerformanceProfiler').default;
            render(_jsx(PerformanceProfiler, { autoRefresh: false }));
            expect(screen.getByText('Performance Profiler')).toBeInTheDocument();
        });
        it('shows performance metrics', () => {
            const PerformanceProfiler = require('../../ui/components/PerformanceProfiler').default;
            const metrics = { fps: 60, frameTime: 16.67, memoryUsage: 128 };
            render(_jsx(PerformanceProfiler, { metrics: metrics, autoRefresh: false }));
            expect(screen.getByText('60')).toBeInTheDocument();
        });
    });
    describe('useSceneGraph hook', () => {
        it('manages scene graph state', () => {
            const { useSceneGraph } = require('../../ui/hooks/useSceneGraph');
            const { result } = renderHook(() => useSceneGraph([
                { id: '1', name: 'Root', type: 'Group', children: [] },
            ]));
            expect(result.current.sceneGraph).toHaveLength(1);
            expect(result.current.getAllNodes()).toHaveLength(1);
        });
        it('toggles node visibility', () => {
            const { useSceneGraph } = require('../../ui/hooks/useSceneGraph');
            const { result } = renderHook(() => useSceneGraph([
                { id: '1', name: 'Node', type: 'Mesh', children: [], visible: true },
            ]));
            result.current.toggleVisibility('1');
            const node = result.current.findNodeById('1');
            expect(node?.visible).toBe(false);
        });
    });
    describe('useSolverControls hook', () => {
        it('controls solver state', () => {
            const { useSolverControls } = require('../../ui/hooks/useSolverControls');
            const { result } = renderHook(() => useSolverControls());
            expect(result.current.isRunning).toBe(false);
            result.current.start();
            expect(result.current.isRunning).toBe(true);
        });
        it('steps through iterations', () => {
            const { useSolverControls } = require('../../ui/hooks/useSolverControls');
            const { result } = renderHook(() => useSolverControls());
            const initialIterations = result.current.iterationCount;
            result.current.step();
            expect(result.current.iterationCount).toBe(initialIterations + 1);
        });
    });
    describe('usePerformanceMetrics hook', () => {
        it('monitors performance', () => {
            const { usePerformanceMetrics } = require('../../ui/hooks/usePerformanceMetrics');
            const { result } = renderHook(() => usePerformanceMetrics({ autoStart: false }));
            expect(result.current.isMonitoring).toBe(false);
            result.current.startMonitoring();
            expect(result.current.isMonitoring).toBe(true);
        });
        it('calculates performance rating', () => {
            const { usePerformanceMetrics } = require('../../ui/hooks/usePerformanceMetrics');
            const { result } = renderHook(() => usePerformanceMetrics({ autoStart: false }));
            expect(result.current.getPerformanceRating()).toBe('excellent');
        });
    });
});
// Helper for testing hooks
function renderHook(callback) {
    let result;
    const TestComponent = () => {
        result = callback();
        return null;
    };
    render(_jsx(TestComponent, {}));
    return { result };
}
//# sourceMappingURL=ui-components.test.js.map