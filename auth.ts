import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import { supabaseAdmin } from '@/lib/supabase';

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId:     process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],

  session: { strategy: 'jwt' },

  callbacks: {
    // Fired on every sign-in — upsert user into our Supabase users table
    async signIn({ user, account }) {
      if (account?.provider !== 'google') return false;
      if (!user.email) return false;

      try {
        const { error } = await supabaseAdmin
          .from('users')
          .upsert(
            {
              email:      user.email,
              name:       user.name  ?? null,
              avatar_url: user.image ?? null,
              google_id:  account.providerAccountId,
            },
            { onConflict: 'google_id' }
          );

        if (error) {
          console.error('[Auth] Supabase upsert error:', error.message);
          return false;
        }
      } catch (err) {
        console.error('[Auth] signIn callback error:', err);
        return false;
      }

      return true;
    },

    // Embed our internal Supabase UUID into the JWT so API routes can use it
    async jwt({ token, account }) {
      // On first sign-in, account is present — fetch our internal user ID
      if (account?.provider === 'google' && token.email) {
        const { data } = await supabaseAdmin
          .from('users')
          .select('id')
          .eq('email', token.email)
          .single();

        if (data?.id) token.userId = data.id;
      }
      return token;
    },

    // Expose userId to useSession() client-side
    async session({ session, token }) {
      if (token.userId) {
        (session.user as typeof session.user & { id: string }).id = token.userId as string;
      }
      return session;
    },
  },

  pages: {
    signIn: '/',   // redirect unauthenticated users back to home, not a separate page
  },
});
