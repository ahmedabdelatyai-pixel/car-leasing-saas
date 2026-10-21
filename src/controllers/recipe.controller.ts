import { Request, Response } from 'express';
import prisma from '../utils/prisma';

export class RecipeController {
  /**
   * Helper to compute overhead per order
   */
  private static async getIndirectCostPerOrder(restaurantId: string): Promise<number> {
    const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId } });
    const overheads = await prisma.restaurantOverhead.findMany({ where: { restaurantId } });
    const totalMonthly = overheads.reduce((sum, o) => sum + Number(o.monthlyAmount), 0);
    const dailyOverheads = totalMonthly / 30;
    const avgOrders = restaurant?.averageDailyOrders || 80;
    return avgOrders > 0 ? dailyOverheads / avgOrders : 0;
  }

  /**
   * Get all recipes with complete live costing & profit margins
   */
  static async getRecipes(req: Request, res: Response) {
    try {
      const restaurant = await prisma.restaurant.findFirst();
      if (!restaurant) {
        return res.status(404).json({ error: 'Restaurant not found' });
      }

      const indirectCost = await RecipeController.getIndirectCostPerOrder(restaurant.id);

      const recipes = await prisma.recipe.findMany({
        where: { restaurantId: restaurant.id },
        include: {
          menuItem: {
            include: { category: true }
          },
          ingredients: {
            include: {
              inventoryItem: true
            }
          }
        },
        orderBy: { updatedAt: 'desc' }
      });

      const formatted = recipes.map(recipe => {
        let directCost = 0;

        const ingredientsList = recipe.ingredients.map(ing => {
          const unitPrice = Number(ing.inventoryItem.pricePerUnit) || 0;
          const qty = Number(ing.quantityUsed) || 0;
          const lineCost = qty * unitPrice;
          directCost += lineCost;

          return {
            id: ing.id,
            inventoryItemId: ing.inventoryItemId,
            name: ing.inventoryItem.name,
            unit: ing.inventoryItem.unit,
            quantityUsed: qty,
            pricePerUnit: Number(unitPrice.toFixed(4)),
            cost: Number(lineCost.toFixed(2))
          };
        });

        const sellingPrice = Number(recipe.menuItem?.price) || 0;
        const trueCost = directCost + indirectCost;
        const netProfit = sellingPrice - trueCost;
        const profitMargin = sellingPrice > 0 ? (netProfit / sellingPrice) * 100 : 0;
        const isLowMargin = profitMargin < 30;

        return {
          id: recipe.id,
          productId: recipe.productId,
          productName: recipe.menuItem?.name || 'صنف غير معروف',
          product: recipe.menuItem ? {
            id: recipe.menuItem.id,
            name: recipe.menuItem.name,
            price: Number(recipe.menuItem.price),
            imageUrl: recipe.menuItem.imageUrl
          } : null,
          categoryName: recipe.menuItem?.category?.name || 'عام',
          productImageUrl: recipe.menuItem?.imageUrl,
          sellingPrice: Number(sellingPrice.toFixed(2)),
          directCost: Number(directCost.toFixed(2)),
          indirectCost: Number(indirectCost.toFixed(2)),
          trueCost: Number(trueCost.toFixed(2)),
          netProfit: Number(netProfit.toFixed(2)),
          profitMargin: Number(profitMargin.toFixed(1)),
          profitMarginPercent: Number(profitMargin.toFixed(1)),
          isLowMargin,
          notes: recipe.notes,
          ingredients: ingredientsList,
          updatedAt: recipe.updatedAt
        };
      });

      return res.json({
        recipes: formatted,
        indirectCostPerOrder: Number(indirectCost.toFixed(2))
      });
    } catch (err: any) {
      return res.status(500).json({ error: 'Failed to fetch recipes', message: err.message });
    }
  }

  /**
   * Get recipe for a specific menu item
   */
  static async getRecipeByProductId(req: Request, res: Response) {
    try {
      const { productId } = req.params;

      const restaurant = await prisma.restaurant.findFirst();
      if (!restaurant) {
        return res.status(404).json({ error: 'Restaurant not found' });
      }

      const indirectCost = await RecipeController.getIndirectCostPerOrder(restaurant.id);

      const recipe = await prisma.recipe.findUnique({
        where: { productId },
        include: {
          menuItem: true,
          ingredients: {
            include: { inventoryItem: true }
          }
        }
      });

      if (!recipe) {
        return res.status(404).json({ error: 'No recipe configured for this item yet.' });
      }

      let directCost = 0;
      const ingredientsList = recipe.ingredients.map(ing => {
        const unitPrice = Number(ing.inventoryItem.pricePerUnit) || 0;
        const qty = Number(ing.quantityUsed) || 0;
        const lineCost = qty * unitPrice;
        directCost += lineCost;

        return {
          id: ing.id,
          inventoryItemId: ing.inventoryItemId,
          name: ing.inventoryItem.name,
          unit: ing.inventoryItem.unit,
          quantityUsed: qty,
          pricePerUnit: Number(unitPrice.toFixed(4)),
          cost: Number(lineCost.toFixed(2))
        };
      });

      const sellingPrice = Number(recipe.menuItem?.price) || 0;
      const trueCost = directCost + indirectCost;
      const netProfit = sellingPrice - trueCost;
      const profitMargin = sellingPrice > 0 ? (netProfit / sellingPrice) * 100 : 0;

      return res.json({
        id: recipe.id,
        productId: recipe.productId,
        productName: recipe.menuItem?.name || 'صنف غير معروف',
        product: recipe.menuItem ? {
          id: recipe.menuItem.id,
          name: recipe.menuItem.name,
          price: Number(recipe.menuItem.price),
          imageUrl: recipe.menuItem.imageUrl
        } : null,
        sellingPrice: Number(sellingPrice.toFixed(2)),
        directCost: Number(directCost.toFixed(2)),
        indirectCost: Number(indirectCost.toFixed(2)),
        trueCost: Number(trueCost.toFixed(2)),
        netProfit: Number(netProfit.toFixed(2)),
        profitMargin: Number(profitMargin.toFixed(1)),
        profitMarginPercent: Number(profitMargin.toFixed(1)),
        isLowMargin: profitMargin < 30,
        notes: recipe.notes,
        ingredients: ingredientsList
      });
    } catch (err: any) {
      return res.status(500).json({ error: 'Failed to fetch recipe', message: err.message });
    }
  }

  /**
   * Create or update recipe for a menu item
   */
  static async saveRecipe(req: Request, res: Response) {
    try {
      const { productId, notes, ingredients } = req.body;

      if (!productId || !ingredients || !Array.isArray(ingredients)) {
        return res.status(400).json({ error: 'Product ID and ingredients array are required.' });
      }

      const restaurant = await prisma.restaurant.findFirst();
      if (!restaurant) {
        return res.status(404).json({ error: 'Restaurant not found' });
      }

      const menuItem = await prisma.menuItem.findUnique({ where: { id: productId } });
      if (!menuItem) {
        return res.status(404).json({ error: 'Menu item not found.' });
      }

      // Fetch all referenced inventory items to compute costs
      const itemIds = ingredients.map((it: any) => it.inventoryItemId);
      const inventoryItems = await prisma.inventoryItem.findMany({
        where: { id: { in: itemIds } }
      });
      const invMap = new Map(inventoryItems.map(i => [i.id, i]));

      const ingredientsData = ingredients.map((it: any) => {
        const inv = invMap.get(it.inventoryItemId);
        const unitPrice = inv ? Number(inv.pricePerUnit) : 0;
        const qty = Number(it.quantityUsed) || 0;
        return {
          inventoryItemId: it.inventoryItemId,
          quantityUsed: qty,
          cost: Number((qty * unitPrice).toFixed(4))
        };
      });

      // Upsert recipe
      let recipe = await prisma.recipe.findUnique({ where: { productId } });

      if (recipe) {
        // Delete old ingredients
        await prisma.recipeIngredient.deleteMany({ where: { recipeId: recipe.id } });
        // Update recipe
        recipe = await prisma.recipe.update({
          where: { id: recipe.id },
          data: {
            notes: notes || null,
            ingredients: {
              create: ingredientsData
            }
          }
        });
      } else {
        // Create new recipe
        recipe = await prisma.recipe.create({
          data: {
            restaurantId: restaurant.id,
            productId,
            notes: notes || null,
            ingredients: {
              create: ingredientsData
            }
          }
        });
      }

      return res.json({
        message: 'تم حفظ وتحديث وصفة الوجبة بنجاح 🧪✅',
        recipeId: recipe.id
      });
    } catch (err: any) {
      return res.status(500).json({ error: 'Failed to save recipe', message: err.message });
    }
  }

  /**
   * Delete recipe
   */
  static async deleteRecipe(req: Request, res: Response) {
    try {
      const { id } = req.params;
      await prisma.recipe.delete({ where: { id } });
      return res.json({ message: 'تم حذف الوصفة بنجاح 🗑️' });
    } catch (err: any) {
      return res.status(500).json({ error: 'Failed to delete recipe', message: err.message });
    }
  }
}
