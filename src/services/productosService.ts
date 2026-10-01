import { supabase } from '../lib/supabase';
import type { Producto, ProductoInput } from '../types/database';

export const productosService = {
  async getAll(): Promise<Producto[]> {
    const { data, error } = await supabase
      .from('productos')
      .select('*')
      .order('nombre');
    
    if (error) throw error;
    return data;
  },

  async getById(id: number): Promise<Producto> {
    const { data, error } = await supabase
      .from('productos')
      .select('*')
      .eq('id_producto', id)
      .single();
    
    if (error) throw error;
    return data;
  },

  async create(producto: ProductoInput): Promise<Producto> {
    const { data, error } = await supabase
      .from('productos')
      .insert(producto)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  async update(id: number, producto: Partial<ProductoInput>): Promise<Producto> {
    const { data, error } = await supabase
      .from('productos')
      .update(producto)
      .eq('id_producto', id)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  async delete(id: number): Promise<void> {
    const { error } = await supabase
      .from('productos')
      .delete()
      .eq('id_producto', id);
    
    if (error) throw error;
  },

  async actualizarStock(id: number, cantidad: number): Promise<Producto> {
    const { data, error } = await supabase
      .from('productos')
      .update({ stock_actual: cantidad })
      .eq('id_producto', id)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }
};
