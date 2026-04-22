# Asset Folder Cleanup Plan

## Current State Analysis
- Total files in src/assets/objects/: 32 legacy flat files + organized subfolders
- Massive duplication between old flat files and new organized structure
- Estimated 40-50% code duplication

## Duplicate Pairs Identified

### Seating Category
- ❌ chairs.ts ↔ ✅ seating/ChairFactory.ts, seating/OfficeChairFactory.ts
- ❌ sofas.ts ↔ ✅ seating/SofaFactory.ts  
- ❌ stools.ts (missing but needed) ↔ ✅ seating/StoolGenerator.ts
- ❌ beds.ts ↔ ✅ seating/BedFactory.ts, beds/BedGenerator.ts
- ❌ pillows (in beds.ts) ↔ ✅ seating/PillowFactory.ts

### Tables Category
- ❌ tables.ts ↔ ✅ tables/TableFactory.ts, tables/DiningTable.ts, tables/CoffeeTable.ts, tables/DeskGenerator.ts

### Storage Category
- ❌ storage.ts ↔ ✅ storage/ShelfGenerator.ts, storage/CabinetGenerator.ts, storage/DrawerUnit.ts

### Lighting Category
- ❌ specialized-lamps.ts ↔ ✅ lighting/CeilingLights.ts, lighting/FloorLamps.ts, lighting/TableLamps.ts
- ❌ lamps/LampGenerator.ts ↔ ✅ lighting/LampBase.ts

### Bathroom
- ❌ bathroom-fixtures.ts ↔ ✅ bathroom/BathroomFixtures.ts

### Decor
- ❌ decor.ts ↔ ✅ decor/WallDecor.ts

### Appliances
- ❌ appliances.ts ↔ ✅ appliances/ApplianceBase.ts, appliances/KitchenAppliances.ts, appliances/LaundryAppliances.ts

### Plants/Vegetation (CRITICAL - Week 9-10 missing files)
- ❌ plants.ts (legacy stub) 
- ❌ advanced-plants.ts (legacy stub)
- ❌ decorative-plants/ (partial)
- ❌ grassland.ts (partial grass)
- ❌ climbing.ts (partial ivy)
- ❌ fruits.ts (partial fruit trees)
- ✅ Need to implement ALL 15 vegetation files properly

## Cleanup Strategy

### Phase A: Remove Legacy Duplicates (Keep NEW organized files)
DELETE these legacy flat files:
1. chairs.ts
2. sofas.ts
3. beds.ts
4. tables.ts
5. storage.ts
6. specialized-lamps.ts
7. lamps/LampGenerator.ts (keep lighting/ folder instead)
8. bathroom-fixtures.ts
9. decor.ts
10. appliances.ts
11. furniture.ts (if duplicate content exists)
12. architectural.ts (check for duplicates)
13. outdoor-furniture.ts (check for duplicates)

### Phase B: Implement Missing Week 9-10 Vegetation Files
CREATE these 15 files in proper structure:
- scatter/vegetation/GrassGenerator.ts
- scatter/vegetation/FernGenerator.ts
- scatter/vegetation/IvyGenerator.ts
- scatter/vegetation/MossGenerator.ts
- scatter/vegetation/MushroomGenerator.ts
- scatter/vegetation/FlowerGenerator.ts
- scatter/vegetation/ShrubGenerator.ts
- scatter/vegetation/PalmGenerator.ts
- scatter/vegetation/ConiferGenerator.ts
- scatter/vegetation/DeciduousGenerator.ts
- scatter/vegetation/FruitTreeGenerator.ts
- scatter/vegetation/DeadWoodGenerator.ts
- scatter/ground/GroundCoverGenerator.ts
- scatter/ground/RockGenerator.ts
- scatter/seasonal/SeasonalVariation.ts

### Phase C: Update Index Files
- Update src/assets/objects/index.ts to export from organized folders only
- Ensure no imports reference deleted legacy files

## Expected Outcome
- Reduce from ~110 files to ~75 files
- Eliminate 40%+ duplication
- Clean, maintainable structure
- All Phase 1 requirements met
