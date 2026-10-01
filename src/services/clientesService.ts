import { supabase } from '../lib/supabase';
import type { Cliente, ClienteInput } from '../types/database';

export const clientesService = {
  async getAll(): Promise<Cliente[]> {
    const { data, error } = await supabase
      .from('clientes')
      .select('*')
      .order('nombre_cliente');
    
    if (error) throw error;
    return data;
  },

  async getById(id: number): Promise<Cliente> {
    const { data, error } = await supabase
      .from('clientes')
      .select('*')
      .eq('id_cliente', id)
      .single();
    
    if (error) throw error;
    return data;
  },

  async create(cliente: ClienteInput): Promise<Cliente> {
    const { data, error } = await supabase
      .from('clientes')
      .insert(cliente)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  async update(id: number, cliente: Partial<ClienteInput>): Promise<Cliente> {
    const { data, error } = await supabase
      .from('clientes')
      .update(cliente)
      .eq('id_cliente', id)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  async delete(id: number): Promise<void> {
    const { error } = await supabase
      .from('clientes')
      .delete()
      .eq('id_cliente', id);
    
    if (error) throw error;
  },

  async getHistorialCompras(idCliente: number): Promise<any[]> {
    const { data, error } = await supabase
      .from('ventas')
      .select(`
        *,
        cliente:clientes(nombre_cliente),
        detalle_venta(
          *,
          producto:productos(nombre)
        )
      `)
      .eq('id_cliente', idCliente)
      .order('fecha', { ascending: false });
    
    if (error) throw error;
    return data;
  }
};
